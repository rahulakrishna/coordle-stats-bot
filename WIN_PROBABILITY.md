# How Win Probability is Calculated

Win probability answers: **"Given how each player is scoring so far, who is most likely to finish the month on top?"**

---

## Step 1 — Average Daily Gain

For each player, we calculate how many points they've been earning per day on average:

```
avg_daily_gain = current_score / days_elapsed
```

For example, if monkaashan has **873 points** on **day 14** of the month:

```
avg_daily_gain = 873 / 14 = 62.4 pts/day
```

---

## Step 2 — Project to End of Month

We then project each player's score forward to the last day of the month, assuming they keep earning at the same daily rate:

```
projected_score = current_score + (avg_daily_gain × days_remaining)
```

Continuing the example with **16 days remaining**:

```
projected_score = 873 + (62.4 × 16) = 873 + 998 = 1871
```

---

## Step 3 — Win Probability

Rather than a binary win/loss, we assign each player a probability **proportional to their projected score** out of the total projected points across all players:

```
win_pct = (player_projected / sum_of_all_projected) × 100
```

So if the three players project to 2000, 1871, and 800 points:

| Player | Projected | Win % |
|--------|-----------|-------|
| Qveen Medusa | 2000 | 42.6% |
| monkaashan | 1871 | 39.9% |
| nice-pathiri | 800 | 17.1% |
| **Total** | **4671** | **100%** |

---

## Caveats

- **Day 1:** With only one snapshot, the projection assumes today's rate holds for the whole month. It stabilises as more days accumulate.
- **Doesn't account for streaks or form** — a player who's been cold recently but has a high cumulative score will still project well.
- **Not a true probability** — it's a proportional projection, not a statistical model. Think of it as "share of projected points", not a betting odds calculation.
