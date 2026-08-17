# Players Search Validation

## Preview observation

The current preview opened from the Team Overview and transitioned into the Players workspace through its expected lazy-loading state. The initial tab switch showed the page loading shell rather than an error boundary, so the visual check can continue once the workspace has completed its load.

The completed workspace presents the name-search input and six quick-access player cards. Entering **Shohei Ohtani** immediately displayed the explicit verified-player search status and a clear-search control while the provider request was in progress.

The live lookup returned one explicit **Open Shohei Ohtani profile** action. Selecting that name dismissed the result list, recorded the player in recent history, and displayed the page-shaped profile loading state instead of a blank or misleading profile panel.

The selected profile completed successfully with Shohei Ohtani identity, current-season metrics, Baseball Savant percentile context, and explicit coverage-gap states where a verified provider did not return a metric. No visible browser or network error was recorded during the search-to-profile walkthrough. The workspace then returned cleanly to the Overview while retaining the player in recent history for the cross-workspace handoff check.

The first recent-history handoff exposed a development-only remount edge case: the player selection was consumed before the strict-mode remount completed, leaving the Players workspace at its quick-access view. The handoff now uses a stable parent callback and consumes the selection after the destination effect begins. A strict-mode regression test confirms the requested profile remains selected through this remount path.

An interactive retest showed that the selection still needed to wait until the strict-mode effect remount had stabilized: the destination received the player name in its search field but did not retain the in-flight profile request. The handoff therefore requires a one-tick deferred start with cleanup, so the first development-only effect pass cannot abort the profile request before the second pass begins.

After the deferred handoff repair, reopening Shohei Ohtani from recent history entered the complete player profile view directly. The page showed verified core MLB data first and clearly labeled the optional Statcast and financial fields as still loading or unavailable, rather than inventing data. This confirms player-name navigation works both from the Players search and from another workspace.

## Keyboard result navigation

The Players workspace renders the search field as a combobox and retains a visible quick-access and Favorites landing state. The keyboard result behavior is covered by the focused regression suite: arrow keys change the active option, Enter opens the active player profile, and the field exposes the active result to assistive technology.

In the current preview, entering **Shohei Ohtani** activates the same combobox and reports that verified MLB and MiLB player records are being searched. The lookup retains the clear-search action and does not hide the existing Favorites or quick-access context while it is in progress.

The completed live lookup renders a labelled listbox containing an option with the explicit action **Open Shohei Ohtani profile**. The visible instruction explains that Up and Down arrows navigate results and Enter opens the selected profile; automated regression coverage verifies the active-option state and selected profile for a multi-result query.

With the populated combobox focused in the live preview, pressing **Down Arrow** activated the result and updated the live feedback to **1 of 1 selected**. This confirms the keyboard event reaches the dropdown rather than the surrounding workspace navigation.
