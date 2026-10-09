# Pending shared planner composition

This is a source handoff for existing owners. The caregiver candidate is independently source-reviewed on its original native 328df base; the complete physical browser gate remains pending. No unreleased collection, Undo or availability implementation has been consumed.

## Named collection contract

The current collection owner is `estate-a4a1879c582f`. Its exact public contract is recorded in:

- [Named collection continuation, #4 comment6067053840](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6067053840).
- [Current shared planner hooks, #55 comment6068688064](https://github.com/Jacob-Met/tastetable/issues/55#issuecomment-6068688064).

The collection provides explicit Save, Preview, Open, Rename and Remove. Each row holds the unchanged canonical `makeWeekFile` text plus a local ID/name. Rename changes only local metadata. Open enters `planRequests.run` before awaiting the fresh asynchronous storage read, then admits through `readWeekFile` and the ordinary acceptance lifecycle. It starts the existing empty worksheet. There is no automatic save or provider refresh.

The owner's current app coordination pin is `a259470e4f2ab12ca7e455c92ab507cd88ba1af3`, stated on 328df. GitHub's blob endpoint returned 404 when read for this handoff. The owner has not supplied a retrievable immutable source tree here; this note records the documented contract and awaits that exact source for actual composition.

## Preserve these seams

| Operation | Composition requirement |
| --- | --- |
| Collection capture/save | Preserve the owner's accepted-plan/current-valid-arrangement capture and exact `makeWeekFile` text. A collection row remains a saved week with local metadata. |
| Collection availability | Preserve `savedWeeks?.refreshCurrent()` in `refreshWeekSave` and after retirement. The new handoff calls `refreshWeekSave` after assigning its accepted origin and prepared worksheet. |
| Collection Open | Preserve entry into `planRequests.run` before the asynchronous storage read. Its `onStart → retirePlan → venueFollowup.retire` path invalidates pending caregiver reads/previews immediately. |
| Caregiver preview | Keep `preparePlanView` read-only. Complete native week/notes admission, source binding, worksheet preparation and response-fragment construction occur before replacement. |
| Caregiver Apply | Preserve the synchronous generation invalidation and commit sequence. `planRequests.invalidate()` retires any pending collection/ordinary reader before the prepared week and note model are accepted. |
| Notes on collection Open | Preserve the owner's existing empty-worksheet acceptance. The collection does not implicitly adopt the caregiver envelope or previously retained worksheet records. |
| Rename/remove/collection preview | Preserve their owner-defined metadata and local collection behavior. The caregiver module owns no collection storage or row lifecycle. |

The browser request controller's existing generation check is what prevents an older storage/read transport from committing after explicit caregiver Apply. A browser abort is not represented as cancellation of native storage or provider work.

## Other preserved owners

Regular Undo/Redo belongs to #40/PR51 and availability arrangement to #36. Their source-acceptance, retirement and history initialization hooks belong at an actual commit/accept boundary. Moving those side effects into `preparePlanView` would make caregiver review mutate the current plan/history, so preparation must remain pure.

The ordinary `render(response, restoredWeek)` entry remains a wrapper around preparation and commit. Existing generation and saved-week flows retain that entry. Day/date/reset changes still call the maintained full week refresh, which notifies the worksheet and invalidates a pending caregiver preview.

Planning-input files #56 and comma-bearing taste entries #57 remain with `estate-8d5ac72a6fae/product`. The caregiver candidate uses the existing `fillForm` and does not edit its taste representation or submission splitter. Their accepted source must be retained during composition.

The native readable HTML companion #54 remains with `chatgpt:c77045b4:windows`; its report/CLI/codec paths are unchanged. Offline comparison, post-visit records, native calendar and native batch owners retain their scopes.

## Current main preservation

Custody parent `145d27981b3c5fe6afa72e205b42582fd72c7734` preserves the native batch source, test, guide and receiving directory (19 additions at 1cba), plus the accepted visit-record CSV source, test, guide and evidence (13 additions at 145d). Both updates add README text. The custody tree is built from that complete 818-leaf parent tree. It adds the caregiver source and evidence, replaces only the approved current app/index/worksheet hooks, and composes the caregiver README paragraph without removing any current text.

All unowned parent leaves and modes must read back exactly. Later integration must use the then-current parent, preserve all newly accepted owners and identify the exact final source tree before receiving. This custody handoff does not authorize a PR or merge while Actions are held.
