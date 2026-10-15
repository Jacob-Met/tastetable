"""Bounded process evidence collaborators; no Windows or application imports."""


def require_exact_membership(direct, members, retained, diagnostics, *,
                             query_identity, query_snapshot, publish, utc):
    """Retain optional evidence, then preserve the original exact refusal."""
    if set(members) == {direct['pid']}:
        return None
    if diagnostics:
        raise RuntimeError('Unexpected owned process membership')
    record = {
        'schema': 'hamon.muse93.unexpected-membership/1',
        'expected_direct': dict(direct), 'members': list(members),
        'observed_utc': None, 'identities': [], 'snapshot': None, 'errors': [],
    }
    diagnostics.append(record)
    try:
        try:
            record['observed_utc'] = utc()
        except BaseException as error:
            record['errors'].append({'phase': 'utc', 'error': repr(error)})
        for row in retained:
            if row['pid'] not in members:
                continue
            identity = {
                'pid': row['pid'], 'created_filetime': row['created_filetime'],
                'observation': None,
                'command_line': {
                    'available': False,
                    'reason': 'No reviewed no-subprocess command-line query is included.',
                },
            }
            record['identities'].append(identity)
            try:
                identity['observation'] = query_identity(dict(row))
            except BaseException as error:
                record['errors'].append({'phase': 'identity', 'pid': row['pid'],
                                         'error': repr(error)})
        try:
            record['snapshot'] = query_snapshot(list(members))
        except BaseException as error:
            record['errors'].append({'phase': 'snapshot', 'error': repr(error)})
        try:
            publish(record)
        except BaseException as error:
            record['errors'].append({'phase': 'publish', 'error': repr(error)})
    finally:
        raise RuntimeError('Unexpected owned process membership')


def wait_retained_handles(retained, *, deadline, forced_cleanup,
                          monotonic, wait, exit_code, close, utc):
    """Observe and close every retained handle within one caller deadline."""
    handles = []
    for row in retained:
        item = {
            'pid': row['pid'], 'created_filetime': row['created_filetime'],
            'requested_ms': None, 'wait_result': None, 'exit_code': None,
            'observed_utc': None, 'closed': False, 'errors': [],
        }
        handles.append(item)
        try:
            try:
                item['requested_ms'] = max(0, int((deadline - monotonic()) * 1000))
                item['wait_result'] = wait(row['handle'], item['requested_ms'])
                if item['wait_result'] != 0:
                    item['errors'].append({'phase': 'wait',
                                           'error': 'Wait result ' + str(item['wait_result'])})
            except BaseException as error:
                item['errors'].append({'phase': 'wait', 'error': repr(error)})
            try:
                item['exit_code'] = exit_code(row['handle'])
            except BaseException as error:
                item['errors'].append({'phase': 'exit_code', 'error': repr(error)})
            try:
                item['observed_utc'] = utc()
            except BaseException as error:
                item['errors'].append({'phase': 'utc', 'error': repr(error)})
        finally:
            try:
                close(row['handle'])
                item['closed'] = True
            except BaseException as error:
                item['errors'].append({'phase': 'close', 'error': repr(error)})
    all_signaled = all(item['wait_result'] == 0 for item in handles)
    return {
        'handles': handles,
        'all_signaled': all_signaled,
        'normal_cleanup': all_signaled and not forced_cleanup and
                          all(item['closed'] and not item['errors'] for item in handles),
        'forced_cleanup': forced_cleanup,
    }
