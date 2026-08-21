# Team Leaders Role-Separation Validation — 2026-08-21

The Team Overview leader card now has five distinct verified categories in each role group. Batting contains HR, AVG, OPS, RBI, and SB; pitching contains ERA, K, WHIP, W, and SV. The card keeps the groups visually distinct and includes a concise method note: hitting rows require PA, while ERA and WHIP require 10 or more IP from pitching rows.

The desktop overview retained its two-column deferred-analysis layout without horizontal overflow. At 375px mobile width, the Overview shell and Team Overview controls fit the viewport without page-level horizontal overflow. Role-specific unit coverage validates that a pitcher-like row can never lead a batting category, a hitter-like row can never lead a pitching category, and tiny pitching samples cannot lead ERA or WHIP.
