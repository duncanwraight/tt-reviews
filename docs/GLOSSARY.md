# Glossary

This document outlines key meanings for this application, with examples where necessary.

## General

- Rubber: Type of rubber used as a covering on a table tennis racket. Always has a topsheet, doesn't always have a sponge. Comes in a number of types:
  - Inverted
  - Anti
  - Long, medium and short pips
- Blade: The mostly-wooden handle and underlying structure which holds two table tennis rubbers. Has to be majority wooden, but can also use carbon plies. Made from 1 or more plies, but most common is 3, 5 and 7 plies

### Oft-used terminology

- Reversal: Some rubbers are capable of "reversing" the spin. This isn't actually what happens - the incoming shot has topspin on, and low-friction rubbers don't grip the ball and override the spin, so the spin continues. However, from the opponent's perspective, the ball will now be backspin so it feels like their topspin has been "reversed" into backspin, rather than a topspin loop being blocked back with topspin from a grippy inverted rubber

## Players

- **Player kind**: discriminates a professional player (world-ranked, with an ITTF peak) from an amateur (country-rated, with a federation rating like German TTR or USATT). Stored as the `player_kind` enum on the `players` and `player_submissions` tables. A mutual-exclusion CHECK constraint enforces that a professional row only carries `peak_world_rank` / `peak_rank_year` and an amateur row only carries `peak_rating_value` / `peak_rating_year`.
- **Career-best ranking** (professionals only): the player's peak ITTF Seniors Singles world ranking, rendered as "World #N (YYYY)". Sourced from the ITTF profile's "Career Best\*\*:" line via the importer (TT-204) or admin entry.
- **Peak rating** (amateurs only): the player's peak country-specific federation rating, rendered as "VALUE LABEL (YYYY)" where the LABEL is derived at render time from `represents ?? birth_country` via `app/lib/players/rating-systems.ts`. Examples: `2434 TTR (2024)`, `2200 Points (2023)`, `1800 USATT (2024)`. Unmapped countries fall back to the literal "Rating" label.

## Strokes

- Topspin loop: A fast attacking stroke where the player brushes the ball to generate spin
- Drive: An attacking stroke which has a flatter contact, generating less spin
- Push: A small stroke, played over the table, which generally imparts backspin upon the ball
- Block: A small stroke, usually used against an opponent's attacking shot, which simply aims to return the ball
- Chop: A defensive stroke used away from the table, with a variable amount of backspin on the ball

## Serves

Different types of serves include:

- Pendulum
- Tomahawk
- Reverse Pendulum
- Hook (AKA jab)

Most of these serves are done with FH, then there is a generic BH serve.

## Rubbers

### Inverted

- AKA "pips-in" or "pimples-in"
- Used to generate spin on the ball
- Can be used to play all strokes
- Attributes:
  - Ability to generate spin
  - Speed
  - Control
  - Sensitivity to spin
  - Feel / sound

### Anti

- AKA "anti-spin", "anti-loop"
- Comes in two main categories:
  - Classic
  - Frictionless (AKA flanti or glanti)
- Defensive rubber used to ignore spin and speed on incoming shots
- Can be used to block, chop, bump and push
- Can rarely generate any of its own spin
- Attributes:
  - Speed
  - Control
  - Sensitivity to spin
  - Impact on spin (e.g. reversal or dead balls)
