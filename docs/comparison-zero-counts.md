# Recorded zero counts in the plan comparison

TasteTable now displays a recorded numeric zero as `0` in the LLM-only comparison column. Previously the four non-Picks rows used a truthiness fallback, so a valid saved response containing zero displayed a dash. This repair changes only that fallback from `||` to `??`; positive values, the Picks branch and nullish renderer fallback keep their existing behavior.

The saved-week codec still requires all five count fields on both sides to be nonnegative safe integers. Missing and null counts remain invalid saved-file inputs. A visible zero reports the supplied count; it does not establish recommendation quality, constraint safety or care suitability.

## Source and ownership

[Issue 105](https://github.com/Jacob-Met/tastetable/issues/105) records this bounded scope. The qualified base is `da02d3572099221b92372f8df573584c8e210b2d`, tree `b2cb38675f023ae337ba124b01cfeb5d6e0aeed0`.

| Path | Qualified candidate blob |
| --- | --- |
| `static/app.js` | `9a34d0e4719bc472144c3ec966e609cc8fbf4626` |
| `tests/caregiver_collection_composition.test.mjs` | `f2c2edc21bae431cb2f4ea4ae710c681b0bd089f` |

Reversing the one operator substitution restores the entire original application file. The test change appends three cases to the maintained application-hook harness and preserves its complete existing prefix. The codec, source fixtures, provider paths, model completion-status offer under issue 71, caregiver/collection behavior and other owners' held work are unchanged. The qualified-base candidate adds this guide and its [portable receipt](qualification/comparison-zero-counts-20261013/receiving.json), preserving all 1,038 unrelated qualified-base leaves and modes.

## Focused native qualification

On Node v22.22.1, the same frozen regression cases ran against the original source first and then the candidate:

```sh
node --experimental-vm-modules --test --test-reporter=junit \
  tests/caregiver_collection_composition.test.mjs tests/test_week_file.mjs
```

The original had 19 of 21 tests passing. Only the new all-zero and mixed-zero cases failed, with the expected dash-versus-zero mismatch. The positive-count control and all 18 existing tests passed. The candidate passed all 21 tests with exit code zero.

The three appended tests open accepted saved files through the existing harness, assert all five labels and both numeric columns, and check that the captured response and input envelope remain exact. Only the existing synthetic health/persona bootstrap requests are allowed by that harness. Eight source inputs were pinned by Git blob and SHA-256, and the retained original baseline and executed candidate copies remained unchanged. This is focused application-hook and codec qualification; the harness explicitly uses DOM, module-mount, storage and calendar doubles.

## Independent browser receiving

Worker `/root/runtime_delivery` froze the acceptance and receiver before receiving candidate bytes, then ran the actual static application on loopback in Chromium 153.0.8010.12, using the pinned saved-week fixture and synthetic health/persona bootstrap endpoints. All 16 static files were verified against their source identities and actual served bytes. The application file was the sole candidate source difference; its 15 companions stayed exact.

| Scenario | Original | Candidate |
| --- | --- | --- |
| Zero counts, 1,280-pixel viewport | Four zero counts displayed as dashes | All four display `0` |
| Positive counts, 1,280-pixel viewport | Pass | Pass |
| Missing count after a valid file | Existing refusal preserved | Existing refusal preserved |
| Null count after a valid file | Existing refusal preserved | Existing refusal preserved |
| Zero counts, 375-pixel viewport | Four zero counts displayed as dashes | All four display `0` |

The original passed 3 of 5 scenarios and 52 of 54 checks; the two display checks were the only failures. The candidate passed all 5 scenarios and all 54 checks with the same receiver, acceptance and fixture identities. Valid-file opening and the native Save button retained the complete response, inputs, week arrangement, received time and calendar identity. Invalid files retained the existing refusal behavior. Both courses reported zero external requests, extra API calls or browser errors, unchanged source copies, and a stopped local server.

The runtime worker viewed the original and candidate comparison-table screenshots at both widths. These are table-only screenshots at Chromium viewport sizes, not full-page or physical-phone qualification. The launcher uses private HOME/XDG/TMP paths for environment isolation; its recorded Chromium sandbox setting is false, so this is not an OS-sandbox claim.

## Evidence and limits

The portable receipt embeds both original and candidate native qualification objects, complete JUnit streams, author controllers, both independent browser raw objects, the frozen acceptance/receiver/fixture builder, the original source freeze and candidate composition. Native paths, byte lengths and SHA-256 hashes are retained for reconciliation.

- Original browser raw: 54,393 bytes, SHA-256 `b98583a2aaaf382e438d6d46f74ca84edeea6aeac24efcde1008ed3846bc886d`.
- Candidate browser raw: 54,311 bytes, SHA-256 `748d5f751e4dbd2ac2d9478a5e343cb973b4702dd3ea083fe27e29e40a8f9ae1`.
- Frozen acceptance: 3,095 bytes, SHA-256 `9a7f357f1c6033d15b6515f6125706d234d8b1f70f22b512a1b34029fc68324f`.
- Unchanged browser receiver: 10,791 bytes, SHA-256 `41036295ff70189da4f5f46a38de6e404ad617a4d3ab572d7f1ea3d8ca60d654`.

Worker `/root/shared_context_delivery` independently reviewed the complete source/test delta, original and candidate focused results, input identities and both browser records. The author and independent receiver are separate roles. Their original failures remain in the packet.

This receiving uses authored synthetic saved files. It does not run the FastAPI backend or a provider, evaluate care decisions, migrate saved data, update APP-TASTE-001's installed application, deploy a site, or claim a complete repository test run. Existing installation and full-stack owners retain those scopes.

## Publication on the later accepted base

Before ref publication, main advanced to `3ffafc78190c69d69063dfa69018cb4f0bbe42a5`, tree `638793f3c72354419e8579134463306b48793c4a`. PR100 adopted its owner's city-whitespace handling in backend `app.py`, an API test and guide; PR106 added 16 receiving files. The complete 19-path advance leaves every focused Node input, every browser static asset and every workflow unchanged.

The final four-path publication preserves that entire accepted delta and all 1,056 unrelated current-base leaves and modes. This is a static source composition. The actual 21-test and 54-check courses remain qualified on `da02d357` plus the reviewed comparison/test candidate; this publication does not claim backend receiving on the later base. The portable packet retains its earlier candidate metadata and all raw evidence, with a separate `publication_composition` record for the later source.
