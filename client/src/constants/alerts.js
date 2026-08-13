// Small, self-contained module for content App.jsx needs on the very
// first paint (the sidebar's Alerts panel and the daily insight quote).
// Deliberately kept separate from constants/data.js — that file holds
// the big prospect/draft/team datasets used only by lazy-loaded tabs,
// and App.jsx importing from it directly would pull all of that into
// the eager main bundle instead of each tab's own lazy chunk.
import { C } from './colors.js';

export const ALERTS = [
  { type:'warn', icon:'●',  title:'IL Placement — Ricky Tiedemann',  body:"Tiedemann placed on 15-day IL with forearm tightness. SKIP flagged velo drop 3 starts ago. Re-evaluate TOR SP depth.",  date:'Jul 9', color:C.rust  },
  { type:'warn', icon:'●', title:'Stock Drop — Jordan Walker',        body:"Walker's K-rate has risen to 32% over last 30 days. SKIP DPI declining — monitor closely. Potential sell candidate.",    date:'Jul 8', color:C.amber },
  { type:'warn', icon:'●', title:'Contract Alert — Gerrit Cole',      body:"Cole has opt-out clause active after 2026 season. SKIP projects 78% probability of opt-out if healthy.",                date:'Jul 6', color:C.amber },
  { type:'good', icon:'●', title:'Breakout Signal — Roman Anthony',   body:"Anthony bat speed up 2.3 mph at AAA. SKIP breakout probability now 81%. BOS call-up imminent — acquire before promotion.", date:'Jul 5', color:C.teal  },
  { type:'good', icon:'●', title:'Draft — Ethan Holliday Signs',      body:"Holliday agrees to $7.8M deal. SKIP had him as top-2 pick — drafting team gets elite SS prospect at fair value.",       date:'Jul 3', color:C.teal  },
];
// NOTE: illustrative sample entries with fixed dates, not a live feed. Swap
// this for a real alert-generation source before launch — see the "Sample
// feed" badge on the Active Alerts panel in App.jsx, which should come off
// too once this is wired to something live.

// (Static canned-score fallback removed — the live ticker in App.jsx now
// shows an honest "connecting / no games / unavailable" state instead of
// ever displaying fabricated scores under a "LIVE" badge.)



export const SKIP_QUOTES = {
  PRIORITY_ACQ: [
    "You don't need me to tell you this player is elite. But you do need me to tell you to stop waiting.",
    "TPVI above 85. Market hasn't caught up. It will. Act accordingly.",
    "This is what a franchise asset looks like in the data. Everything checks out. Acquire.",
    "Players like this don't hit the open market often. When they do, hesitation is a strategy for losing teams.",
    "I've run the numbers four times because this good looked suspicious. It's real.",
  ],
  STRONG_BUY: [
    "The data says buy. The instinct that says wait is just fear wearing a sportscoat.",
    "Not yet elite by the numbers, but the trajectory lines up. Get ahead of the market.",
    "Strong Buy isn't a compliment — it's an instruction.",
    "This is how above-average becomes elite: you acquire it before everyone agrees it already is.",
    "Risk-adjusted, this is one of the better bets in the league right now.",
  ],
  MONITOR: [
    "Good enough to watch. Not good enough to pay full price for. Don't confuse the two.",
    "Monitor means exactly that — not buy, not sell. Patience is a baseball skill too.",
    "The numbers are trending in the right direction. Whether they get there is still an open question.",
    "Above average. Solidly. Which is worth something, not everything.",
    "I'll tell you when it's time to act. Right now it's time to watch.",
  ],
  HOLD: [
    "Average has a place. Just make sure you're paying an average price for it.",
    "No compelling reason to buy. No compelling reason to sell. Hold and redirect your attention.",
    "HOLD doesn't mean forever. It means not now.",
    "Competent. Affordable. Unremarkable. Sometimes that's exactly what you need.",
    "The market has priced this correctly. Which means there's no edge here. Move on.",
  ],
  AVOID: [
    "The numbers are the numbers. I don't enjoy this conclusion any more than you do.",
    "Avoid isn't a criticism of the player. It's a statement about risk vs. return.",
    "There are 750 players on 40-man rosters. Not all of them deserve your attention or your budget.",
    "Sometimes the most important decision is knowing when not to decide.",
    "I've seen rosier projections. Usually they were wrong too.",
  ],
  archetypes: {
    'Elite Offensive Force':      "This is why batting practice exists — and why pitchers have nightmares.",
    'Above-Avg Producer':         "Consistently good. In baseball, consistently good is worth a lot of money.",
    'Patient On-Base Machine':    "Walks don't show up in highlight reels. They show up in runs scored.",
    'Raw Power Threat':           "The exit velocity doesn't lie. Neither does the launch angle.",
    'Solid Regular':              "Dependable. Which is underrated. Most players aren't.",
    'Ace / #1 Starter':           "The kind of arm that changes a series. And a season.",
    'Mid-Rotation Starter':       "A No. 2 or 3 starter who earns every inning. This team is lucky to have him.",
    'Backend / Reliever':         "Role player. Valuable in the right context. Don't overpay.",
  },
  statcast: {
    highBarrel:  "That Barrel% is why pitchers don't sleep well before facing this lineup.",
    highEV:      "Exit velocity at this level puts balls in places outfielders aren't.",
    eliteK9:     "K/9 in the upper tier means opposing hitters are going back to the dugout early and often.",
    lowWHIP:     "A WHIP that low means baserunners are a rarity. The defense says thank you.",
    highHardHit: "Hard Hit% this high is sustainable. It's not luck — it's swing decisions and bat speed.",
    generic:     "Statcast confirms what the traditional line suggests. The data is consistent.",
  },
  contextual: {
    fallbackYear:  "Note: I'm working from prior-year data. Current season hasn't produced enough sample yet. Factor that in.",
    youngPlayer:   "Young player. Small sample. Adjust your certainty accordingly — but watch the trajectory.",
    veteranPlayer: "Veteran profile. What you see is largely what you get. Age curve applies.",
    pitcherHealth: "Every pitcher carries injury risk. Model assumes health. Market it accordingly.",
  },
  team: {
    gradeA:   "This is what a legitimate World Series contender looks like in the data.",
    gradeB:   "Playoff team. The ceiling depends on which version shows up in October.",
    gradeC:   "Competitive. Not a contender. The roster construction needs work.",
    gradeD:   "Rebuild. The sooner the front office acknowledges it, the better the outcome.",
  },
  dailyInsights: [
    "The market prices yesterday's performance. I price tomorrow's.",
    "Most baseball decisions are made with too much confidence and too little data.",
    "Confirmation bias is the enemy of every scouting department that's ever existed.",
    "The Nash Equilibrium says pitchers leave value on the table with zero-strike counts.",
    "A player's BABIP regressing to the mean is not bad luck. It's math.",
    "The best time to acquire a player is before the rest of the market agrees he's good.",
    "WAR compresses everything that matters into one number and loses some signal doing it.",
    "Hitters swing too often with two strikes. Pitchers know it. The numbers confirm it. And yet.",
    "The El Farol problem: once everyone uses the same edge, it stops being an edge.",
    "Draft efficiency isn't about who you take. It's about taking them one pick before someone else would.",
    "Free agent inflation is theoretically inevitable. The prisoner's dilemma ensures it.",
    "Scouting and analytics aren't opposing philosophies. They're the same question asked two different ways.",
    "A 60-grade tool on a 20-80 scale is good. That's all. Not great. Good.",
    "The best negotiating strategy is to always make the first offer low. Game theory says so.",
    "Velocity declining two straight years isn't a trend yet. Three straight years is.",
  ],
};


export function getDailyInsight() {
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return SKIP_QUOTES.dailyInsights[day % SKIP_QUOTES.dailyInsights.length];
}

