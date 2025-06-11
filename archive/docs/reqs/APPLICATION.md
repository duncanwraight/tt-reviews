# Requirements - Application

## Introduction

This application is a website about table tennis. Its MVP will involve two main sections - equipment reviews and player profiles.

## Equipment reviews

A number of table tennis review sites already exist, but the quality of information on them is debatable.

We want to provide equipment reviews which can be trusted - and we think the best way to do this is by using clear, consistent metrics; adding context; and providing information about the reviewer alongside the review.

- Reviews will be grouped by the equipment being reviewed, e.g. we will have a "Curl P1-R" page which holds all reviews for this rubber
  - "Used by"... with a list of players we feature (see Player profiles below)
  - Can be linked to from Player profiles and Equipment search pages, as well as displaying in generic search box
- Any logged-in user can submit a review, but they will be moderated by the community on the OOAK Discord server
- Reviewers have to provide context about their reviews, e.g.
  - Their playing level, preferably a known rating/ranking (USATT, TTR, FR etc)
  - Style of play
  - Duration / quantity / type of testing
  - Other equipment used whilst testing
  - Where the equipment was bought, and how much was paid
- Reviewers will add subjective comments, but will also provide ratings relevant to the type of equipment being reviewed, e.g.
  - On an inverted rubber: spin, speed, control
  - On a long pips rubber: spin generation, spin "reversal", control
  - On a blade: handle, quality, speed, dwell time, control

## Player profiles

Table tennis players who like looking at equipment reviews often want to know what equipment top players are using. There is a lot of talk online about this, but often the information is fourth-hand, and again cannot be trusted.

We will create player profiles, which will be moderated in a similar way to the reviews. We will allow any professional player to have a profile, and top-rated amateurs or YouTube celebrities.

An example profile might look like:

- Player name: Joo Saehyuk
- Highest rating: WR6
- Active: 2004-2020
- Quality footage (users can submit an "inactive marker" for moderation if links fail):
  - <<youtube link>>
  - <<youtube link>>
- Sponsors:
  - 2007: Butterfly
- Equipment used:
  - 2007
    - Blade: Butterfly Diode
    - Forehand: Tenergy 64 (red, max)
    - Backhand: TSP Curl P1-R (black, 1.5mm)
    - Source: Player interview <<link>>
  - 2019
    - Blade: Butterfly Diode
    - Forehand: Tenergy 64 (red, max)
    - Backhand: Victas Curl P3aV (black, 1.5mm)
    - Source: YouTube video <<link>>

Any logged-in user will be able to add these sponsorship details, footage links and equipment entries, but they will have to provide a source which can be moderated by the community.

## Search functionality

One of the most important elements of this application is searching. We want users to be able to find the right equipment for their game.

- Generic search box should always display prominently on the site
  - This allows users to search primarily for names or types, e.g. "curl p1-r" or "long pips"
- We should also have a separate page dedicated to finding the right equipment for a player
  - Forehand rubber, backhand rubber, blade - or just some of these
  - Ask player what they're looking for, e.g. spin/control and style of play
  - Use category ratings to suggest rubbers, using a weighted search
