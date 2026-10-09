// SPDX-License-Identifier: MIT
// Independent receiving helper: observe only one already-owned Windows browser.
// No target termination, profile mutation, policy flag or account change.
// On observer deadline, only this helper's spawned PowerShell is terminated.
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$proc = $null
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Depth 8 -Compress)); [Console]::Out.Flush() }
try {
  $spec = [Console]::In.ReadLine() | ConvertFrom-Json
  $targetId = [int]$spec.pid
  $proc = [System.Diagnostics.Process]::GetProcessById($targetId)
  # Force opening and retain this handle BEFORE any READY acknowledgement.
  $heldHandle = $proc.Handle
  $startTicks = $proc.StartTime.ToUniversalTime().Ticks.ToString()
  $actualExe = $proc.MainModule.FileName
  if ($proc.HasExited) { throw 'Target exited before admission' }
  $row = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $targetId)
  if ($null -eq $row) { throw 'Target has no current CIM identity' }
  if ([int]$row.ProcessId -ne $targetId -or [int]$row.ParentProcessId -ne [int]$spec.parentPid) { throw 'PID/parent identity mismatch' }
  if (-not [String]::Equals($actualExe, [string]$spec.executablePath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Process executable mismatch' }
  if (-not [String]::Equals([string]$row.ExecutablePath, [string]$spec.executablePath, [StringComparison]::OrdinalIgnoreCase)) { throw 'CIM executable mismatch' }
  if ($startTicks -cne [string]$spec.startTimeUtcTicks) { throw 'Process start-time identity mismatch' }
  $cmd = [string]$row.CommandLine
  $profile = [Regex]::Escape([string]$spec.profilePath)
  $profilePattern = '(?:^|\s)--user-data-dir(?:=|\s+)(?:"' + $profile + '"|' + $profile + ')(?=\s|$)'
  if (-not [Regex]::IsMatch($cmd, $profilePattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) { throw 'Owned profile argument mismatch' }
  if ([Regex]::IsMatch($cmd, '(?:^|\s)--type(?:=|\s|$)')) { throw 'A Chrome subprocess is not the browser owner' }
  # Recheck the same held process after the independent CIM read.
  if ($proc.HasExited -or $proc.StartTime.ToUniversalTime().Ticks.ToString() -cne $startTicks) { throw 'Process changed during admission' }
  $identity = [ordered]@{
    pid=$targetId; parentPid=[int]$row.ParentProcessId;
    executablePath=$actualExe; startTimeUtcTicks=$startTicks;
    cimCreationTimeUtc=$row.CreationDate.ToUniversalTime().ToString('o');
    profilePath=[string]$spec.profilePath; commandLine=$cmd;
    handleOpened=$true; observerPid=$PID
  }
  Emit ([ordered]@{event='READY';identity=$identity})
  if (-not $proc.WaitForExit([int]$spec.waitMs)) {
    Emit ([ordered]@{event='TIMEOUT';identity=$identity;confirmedExit=$false})
    exit 2
  }
  $actualExitCode = $proc.ExitCode
  Emit ([ordered]@{event='EXIT';identity=$identity;confirmedExit=$true;exitCode=$actualExitCode})
  exit 0
} catch {
  Emit ([ordered]@{event='ERROR';message=$_.Exception.Message;confirmedExit=$false})
  exit 2
} finally {
  if ($null -ne $proc) { $proc.Dispose() }
}
`;

/**
 * Caller supplies identity captured from its own browser discovery, including
 * decimal .NET Process.StartTime.ToUniversalTime().Ticks. Parent PID is the
 * already-owned launcher for a handoff, or the originally observed parent for
 * a direct launch. This helper never chooses a process by name alone.
 *
 * Await this function BEFORE sending Browser.close. Then await observer.closed
 * BEFORE removing the owned profile. A timeout/refusal cannot authorize cleanup.
 */
export async function observeOwnedChromeProcess({
  pid, parentPid, executablePath, profilePath, startTimeUtcTicks,
  waitMs = 30_000, readyTimeoutMs = 10_000,
}) {
  for (const [key, value] of Object.entries({ pid, parentPid })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(key + ' must be a positive PID');
  }
  if (process.platform !== 'win32') throw new Error('Windows process observer requires Windows');
  for (const [key, value] of Object.entries({ executablePath, profilePath })) {
    if (typeof value !== 'string' || !/^[A-Za-z]:\\/.test(value) || /["\r\n\0]/.test(value)) {
      throw new TypeError(key + ' must be an absolute, quote-free Windows path');
    }
  }
  if (typeof startTimeUtcTicks !== 'string' || !/^[1-9][0-9]{15,18}$/.test(startTimeUtcTicks)) {
    throw new TypeError('Exact decimal process start ticks are required');
  }
  for (const [key, value] of Object.entries({ waitMs, readyTimeoutMs })) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) throw new TypeError('Invalid ' + key);
  }

  const ps = String(process.env.SystemRoot || 'C:\\Windows') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const spec = { pid, parentPid, executablePath, profilePath, startTimeUtcTicks, waitMs };
  const events = [];
  let stdout = '', stderr = '', pending = '', failure = null;
  const observerStops = [];
  let readyIdentity = null, exitEvent = null, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // Keep early failures observed while the close receipt is being assembled.
  ready.catch(() => {});
  const fail = error => {
    failure ??= error instanceof Error ? error : new Error(String(error));
    readyReject(failure);
  };
  const sameIdentity = identity => identity
    && identity.pid === pid && identity.parentPid === parentPid
    && identity.startTimeUtcTicks === startTimeUtcTicks
    && identity.executablePath.toLowerCase() === executablePath.toLowerCase()
    && identity.profilePath === profilePath && identity.handleOpened === true;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => {
    stdout += text;
    if (stdout.length > 64 * 1024) { fail(new Error('Observer stdout exceeds limit')); return; }
    pending += text;
    for (;;) {
      const end = pending.indexOf('\n');
      if (end < 0) break;
      const line = pending.slice(0, end).replace(/\r$/, ''); pending = pending.slice(end + 1);
      if (!line) continue;
      try {
        const row = JSON.parse(line); events.push(row);
        if (row.event === 'READY') {
          if (readyIdentity || !sameIdentity(row.identity)) throw new Error('Invalid or duplicate READY identity');
          readyIdentity = row.identity;
          readyResolve(row.identity);
        } else if (row.event === 'EXIT') {
          if (!readyIdentity || exitEvent || !sameIdentity(row.identity)
              || JSON.stringify(row.identity) !== JSON.stringify(readyIdentity)
              || row.confirmedExit !== true || !Number.isInteger(row.exitCode)) {
            throw new Error('Invalid or unbound EXIT event');
          }
          exitEvent = row;
        } else {
          throw new Error('Observer refused: ' + line);
        }
      } catch (error) { fail(error); }
    }
  });
  child.stderr.on('data', text => {
    stderr += text;
    if (stderr.length > 64 * 1024) fail(new Error('Observer stderr exceeds limit'));
  });
  child.on('error', fail);
  child.stdin.on('error', fail);
  const stopObserver = reason => {
    fail(new Error(reason));
    const stop = { reason, requested: false, error: null }; observerStops.push(stop);
    // This is the exact child spawned above, never the Chrome target PID.
    try { stop.requested = child.kill(); } catch (error) { stop.error = String(error); }
  };
  const timer = setTimeout(() => stopObserver('Observer READY timed out'), readyTimeoutMs);
  const outerTimer = setTimeout(() => stopObserver('Observer process deadline exceeded'),
    readyTimeoutMs + waitMs + 5_000);
  const closed = (async () => {
    let code, signal;
    try { [code, signal] = await once(child, 'close'); }
    catch (error) { fail(error); }
    clearTimeout(timer); clearTimeout(outerTimer);
    if (pending.trim()) fail(new Error('Unterminated observer record'));
    if (!readyIdentity || !exitEvent || code !== 0 || signal !== null || stderr.trim()) {
      fail(new Error('Observer did not confirm a complete cleanly reported process exit'));
    }
    const receipt = { observerExitCode: code, observerSignal: signal, stdout, stderr,
      events, observerStops, identity: readyIdentity, confirmedExit: !!exitEvent && !failure,
      exitCode: exitEvent?.exitCode ?? null };
    if (failure) { failure.receipt = receipt; throw failure; }
    return receipt;
  })();
  closed.catch(() => {});
  child.stdin.end(JSON.stringify(spec) + '\n');
  let identity;
  try { identity = await ready; }
  catch (error) {
    // Preserve custody of the observer after an uncertain READY; it never kills
    // the target and the native wait remains bounded by waitMs.
    error.observerPid = child.pid ?? null;
    error.observerClosed = closed;
    throw error;
  }
  clearTimeout(timer);
  return Object.freeze({ identity, closed });
}
