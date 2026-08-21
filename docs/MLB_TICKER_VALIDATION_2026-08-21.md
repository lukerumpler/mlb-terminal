# MLB Ticker Validation — 2026-08-21

The ticker was checked against the official MLB schedule endpoint and the project’s MLB proxy. At 2026-08-21 02:53 UTC, the official August 20 schedule held eight final games and one live game, while the August 21 schedule held fifteen preview games. The previous UTC date calculation therefore surfaced tomorrow’s pregame slate for users in western time zones while labeling it **LIVE**.

The ticker now uses the MLB Eastern Time schedule date, derives its state from official game status, displays live scores only for in-progress games, displays completed scores as **Final**, and labels forthcoming games **SCHEDULE** with their published start time. Its visual source label is **MLB**, with the complete `MLB Stats API` source and retrieval time available to assistive technology and as a hover title.

At 375px mobile width, the corrected ticker remained visible in the fixed workspace frame, showed the MLB source label and official final-score text, and did not create horizontal page overflow.
