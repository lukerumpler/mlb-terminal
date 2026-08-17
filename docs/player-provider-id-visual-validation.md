# Player Provider-ID Confidence Visual Validation

Local development preview was checked on 2026-08-17 using the Shohei Ohtani player profile at desktop width. The player profile completed its existing optional provider and boxscore requests and rendered the data-confidence strip beneath the performance summary. The strip preserved its existing Identity, Season stats, Statcast, and Contract entries and added a fifth **B-Ref ID** entry.

The live upstream resolution was unavailable in this local session, so the new entry correctly rendered **Unavailable** rather than claiming a provider mapping. This is the intended safe state: no near-name result, guessed identifier, or historical Baseball-Reference metrics are attached when an exact canonical mapping is absent. Focused automated coverage separately verifies that a valid exact-name mapping displays **Exact name** confidence and exposes its canonical Baseball-Reference identifier in the item tooltip.

The strip wrapped cleanly in the available desktop layout. Mobile behavior remains governed by the existing responsive source-strip rules, which allow items to wrap without a fixed column count.
