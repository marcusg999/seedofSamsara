# Lore Bible — Seed of Samsara

Every lore claim in the game traces back to a numbered claim in this file, and
every claim names its source (CLAUDE.md § Content rules). Cite a claim from code
or copy by its id, like `L-THRESH-04`.

Built from the source list in GAME_BRIEF.md § Research. Nothing here is invented:
where the game needs something the sources do not supply, it is recorded in
§ 12 Open inventions as a design choice, not as lore.

## 0. Evidence tiers

The sources are not of one kind, and the game should not pretend they are. Each
claim carries a tier, so a designer can tell what they are standing on.

| Tier | Meaning |
| --- | --- |
| **E** | Empirical. Peer-reviewed study with a stated method and sample. |
| **P** | Phenomenological report. First-person accounts collected and categorised, but not controlled. |
| **T** | Tradition. Religious, philosophical or mythic text. A culture's account, not a measurement. |
| **C** | Channelled or clinical-anecdotal. Presented by its author as testimony; no external verification possible. |

A tier is not a ranking of worth to the game — a **T** source may drive a better
scene than an **E** one. It is a ranking of what may be *asserted as fact* in
player-facing text. Only **E** claims may be stated flatly in any diegetic
framing device that implies real-world authority; everything else belongs to the
fiction.

## 1. Source register

| Key | Source | Tier |
| --- | --- | --- |
| `MOODY-1975` | Moody, Raymond A. *Life After Life*. Mockingbird Books, 1975. | P |
| `GREYSON-1983` | Greyson, Bruce. "The Near-Death Experience Scale: Construction, Reliability, and Validity." *Journal of Nervous and Mental Disease* 171(6), 1983, 369–375. | E |
| `GREYSON-BUSH-1992` | Greyson, Bruce, and Nancy Evans Bush. "Distressing Near-Death Experiences." *Psychiatry* 55(1), 1992, 95–110. | P |
| `VANLOMMEL-2001` | van Lommel, Pim, et al. "Near-Death Experience in Survivors of Cardiac Arrest: A Prospective Study in the Netherlands." *The Lancet* 358(9298), 2001, 2039–2045. | E |
| `PARNIA-2014` | Parnia, Sam, et al. "AWARE — AWAreness during REsuscitation — A Prospective Study." *Resuscitation* 85(12), 2014, 1799–1805. | E |
| `PARNIA-2023` | Parnia, Sam, et al. AWARE-II. *Resuscitation*, 2023. | E |
| `TIMMERMANN-2018` | Timmermann, Christopher, et al. "DMT Models the Near-Death Experience." *Frontiers in Psychology* 9:1424, 2018. | E |
| `STRASSMAN-2001` | Strassman, Rick. *DMT: The Spirit Molecule*. Park Street Press, 2001. | C |
| `STEVENSON-1997` | Stevenson, Ian. *Reincarnation and Biology: A Contribution to the Etiology of Birthmarks and Birth Defects*. Praeger, 1997. | P |
| `TUCKER-2005` | Tucker, Jim B. *Life Before Life*. St. Martin's Press, 2005. (UVA Division of Perceptual Studies.) | P |
| `NEWTON-1994` | Newton, Michael. *Journey of Souls: Case Studies of Life Between Lives*. Llewellyn, 1994. | C |
| `SCHWARTZ-2009` | Schwartz, Robert. *Your Soul's Plan*. Frog Books, 2009 (first published as *Courageous Souls*, 2007). | C |
| `BARDO` | *Bardo Thödol* (Tibetan Book of the Dead). 8th c. attrib. Padmasambhava; recovered 14th c. Translations: Evans-Wentz 1927; Fremantle & Trungpa 1975; Thurman 1994; Coleman & Jinpa 2005. | T |
| `PLATO-ER` | Plato, *Republic* Book X, 614a–621d (the Myth of Er). | T |
| `EGYPT-BD` | *Egyptian Book of the Dead* (Book of Going Forth by Day), esp. Spell 30B and Spell 125 (the weighing of the heart). | T |
| `FRANCHEZZO-1896` | Franchezzo [A. Farnese, transcr.]. *A Wanderer in the Spirit Lands*. 1896. Local copy: `research/sources/franchezzo-wanderer-in-the-spirit-lands-1896.txt` (public domain; Internet Archive item `wandererinspirit1896fran`). | C |

Franchezzo citations below give chapter and the page number printed in the 1896
edition, both readable in the local text's table of contents.

## 2. The Threshold — Moody's recurring elements

`MOODY-1975` assembled roughly fifteen recurring elements from about fifty
accounts and composed them into one model sequence, while stating plainly that
no two accounts matched and that no single person reported every element. The
Threshold is built on that model sequence — which means **the game's ordering is
Moody's composite, not a finding about dying.**

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-THRESH-01` | The dying hear themselves pronounced dead by those attending them. | `MOODY-1975` | P | `threshold.pronounced-dead` |
| `L-THRESH-02` | A buzzing, ringing or roaring accompanies the transition. | `MOODY-1975` | P | `threshold.buzzing` |
| `L-THRESH-03` | The point of view separates from the body and observes it, often from above. | `MOODY-1975`, `PARNIA-2014` | P/E | `threshold.out-of-body` |
| `L-THRESH-04` | Movement through a dark tunnel, passage or void toward light. | `MOODY-1975` | P | `threshold.tunnel` |
| `L-THRESH-05` | Deceased relatives and other presences meet the traveller. | `MOODY-1975` | P | `threshold.loved-ones` |
| `L-THRESH-06` | A being of light is met, felt as wholly loving and without judgement. | `MOODY-1975` | P | `threshold.being-of-light` |
| `L-THRESH-07` | A review of the life is shown, panoramic and often simultaneous rather than sequential. | `MOODY-1975` | P | `light.life-review` |
| `L-THRESH-08` | A border or limit is reached, understood as the point of no return. | `MOODY-1975` | P | `threshold.border` |
| `L-THRESH-09` | Many report reluctance to come back, and lasting change afterwards. | `MOODY-1975`, `VANLOMMEL-2001` | P/E | `threshold.choice`, `dmt.sent-back` |

Design note: the life review is reported as panoramic and *felt*, not watched
(`L-THRESH-07`). GAME_BRIEF.md § Path A makes the player re-live moments from
other people's point of view, which is the game's way of staging that reported
quality. The mechanic is the game's; the quality it stages is Moody's.

## 3. Intensity — the Greyson scale

| Claim | Statement | Source | Tier |
| --- | --- | --- | --- |
| `L-SCALE-01` | The NDE Scale has 16 items in four clusters: cognitive, affective, paranormal, transcendental. | `GREYSON-1983` | E |
| `L-SCALE-02` | Each item scores 0 (absent), 1 (mildly or ambiguously present) or 2 (definitely present); maximum 32. | `GREYSON-1983` | E |
| `L-SCALE-03` | A score of 7 or more is the threshold for counting an experience as an NDE. | `GREYSON-1983` | E |

Use: the four clusters are a ready-made instrument for the game's own telemetry.
A vignette's Threshold run can be scored against the same four axes, giving the
Council (`light.council`) something to weigh that is structurally borrowed rather
than invented. **Not** player-facing as a number: a visible score would turn the
moral engine into a high-score table, which GAME_BRIEF.md § Systems rules out by
defining karma as effect on others, not a meter.

## 4. Distressing experiences — the lower spheres

`GREYSON-BUSH-1992` is the grounding for Path B's lower spheres, and the single
most important source for keeping them from being generic horror.

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-DARK-01` | Distressing NDEs occur and fall into three types. | `GREYSON-BUSH-1992` | P | — |
| `L-DARK-02` | Type 1 — *inverted*: the same phenomenology as a radiant NDE (tunnel, light, presences) experienced as terrifying rather than loving. | `GREYSON-BUSH-1992` | P | `refuse.mist` |
| `L-DARK-03` | Type 2 — *void*: an experience of nonexistence, or of an eternal featureless emptiness, often with the conviction that one never existed at all. | `GREYSON-BUSH-1992` | P | `refuse.void` |
| `L-DARK-04` | Type 3 — *hellish*: explicitly infernal landscapes and hostile beings. | `GREYSON-BUSH-1992` | P | `refuse.lower-sphere` |

Design note: Type 1 is the valuable one and the easiest to lose. An *inverted*
sphere is not a different place from the Light — it is the same place, read with
dread. That is a shader and sound problem, not a content problem: the same
tunnel geometry, the same figures resolving out of glow, re-graded. Building
`refuse.mist` by re-grading `threshold.tunnel` rather than by modelling a new
scene is both cheaper and truer to `L-DARK-02`.

## 5. Cardiac arrest — the heart-attack vignette and the out-of-body view

| Claim | Statement | Source | Tier |
| --- | --- | --- | --- |
| `L-ARREST-01` | In a prospective study of 344 successfully resuscitated cardiac-arrest patients across ten Dutch hospitals, 62 (18%) reported some recollection from the period of unconsciousness; 41 (12%) reported a core experience. | `VANLOMMEL-2001` | E |
| `L-ARREST-02` | Depth of experience did not correlate with duration of arrest or of unconsciousness, nor with medication; the authors reported that medical factors did not explain who had an experience. | `VANLOMMEL-2001` | E |
| `L-ARREST-03` | In AWARE, across 2,060 cardiac arrests at 15 hospitals, about 9% of interviewed survivors had experiences meeting NDE criteria, and about 2% described explicit recall of seeing or hearing real events during resuscitation. | `PARNIA-2014` | E |
| `L-ARREST-04` | AWARE reported one case with a verifiable period of awareness during which cerebral function was not expected. | `PARNIA-2014` | E |
| `L-ARREST-05` | AWARE-II followed 567 in-hospital cardiac-arrest patients in the US and UK, with EEG and cerebral oximetry on a subset of 85, and recorded spikes of near-normal gamma, beta and alpha activity during CPR, in some cases up to an hour in. | `PARNIA-2023` | E |

Design note for `death.heart-attack` and `threshold.out-of-body`: the research
supports a *sparse, specific* out-of-body view — a resuscitation seen in
fragments, with a small number of verifiable details — not a free-flying camera.
`L-ARREST-03` puts explicit veridical recall at about 2% of survivors. The
vignette should give the player few details and make them count, because that is
what the strongest reports look like.

## 6. DMT — the edge-case vignette and the hyperspace thread

| Claim | Statement | Source | Tier |
| --- | --- | --- | --- |
| `L-DMT-01` | In a within-subjects, placebo-controlled, single-blind study, 13 healthy volunteers received intravenous DMT; their experiences were scored on the Greyson NDE scale and compared with 67 age- and gender-matched people reporting actual NDEs. | `TIMMERMANN-2018` | E |
| `L-DMT-02` | DMT experiences overlapped with actual NDEs on nearly all of the scale's phenomenological features, with the strongest convergence on transcendental and mystical items. | `TIMMERMANN-2018` | E |
| `L-DMT-03` | Reports commonly describe entering an apparently autonomous space and encountering entities that appear aware of, and responsive to, the experiencer. | `STRASSMAN-2001`, `TIMMERMANN-2018` | C/E | `dmt.hyperspace` |

Design note: `L-DMT-02` is the licence for the DMT vignette to lead into the
same Threshold as the six deaths — the overlap is measured, not asserted. The
entity encounters (`L-DMT-03`) justify GAME_BRIEF.md's requirement that
hyperspace entities "feel aware of the player": they should track, respond and
initiate, never act as scenery.

CLAUDE.md § Content rules: the vignette depicts the experience only. This file
deliberately records no dosing, route or preparation detail, and the scene must
not either. The study's method is cited above at the level of study design, which
is what traceability needs — nothing more.

As built, `death.dmt` opens with the experience already beginning. There is no
object in the room that belongs to one, no action is depicted, and no substance,
quantity, route or method is named anywhere in the scene, its captions, its
content notes or its code. What the vignette contains is a carpet, a lamp, a
window, a half-painted wall and a doorframe with pencil marks on it — which is
to say a person, which is the only subject the rule leaves and the only one
worth having.

## 7. Past lives and birthmarks

| Claim | Statement | Source | Tier |
| --- | --- | --- | --- |
| `L-PAST-01` | Across decades of case collection, young children sometimes make statements about a previous life, typically beginning between ages two and five and fading by about seven or eight. | `STEVENSON-1997`, `TUCKER-2005` | P |
| `L-PAST-02` | In a subset of cases, a birthmark or birth defect corresponds in location to a wound — often a fatal one — recorded in the life the child describes. | `STEVENSON-1997` | P |
| `L-PAST-03` | Reported cases cluster in the violent and the unfinished: many of the previous lives described ended suddenly or by violence. | `STEVENSON-1997`, `TUCKER-2005` | P |

Design note: `L-PAST-02` is the mechanical heart of the PAST LIVES system and the
`market.body` aisle — a death wound carried into the next avatar as a birthmark.
`L-PAST-03` quietly justifies the brief's whole vignette list: six of the seven
deaths are sudden or violent, which is where the reported cases actually sit.
That is a real alignment between the content and the research, and it is worth
saying out loud so it does not read as a taste for violence.

`L-PAST-01` is also the licence for META-PROGRESSION's rule that specifics fade
while wisdom persists: the fading of past-life statements with age is the
reported pattern, and the game's memory model mirrors it.

## 8. Between lives — the Council and the Life Market

These are the game's most load-bearing sources and its weakest evidence. Both
are **C**: clinical-anecdotal material from hypnotic regression, presented by its
authors as testimony. The Life Market is excellent fiction built on them; it must
never be framed as finding.

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-BETWEEN-01` | Souls are described as belonging to stable groups that reincarnate in company and meet again across lives. | `NEWTON-1994` | C | `market.contracts` |
| `L-BETWEEN-02` | A council of elders or guides is described as meeting the soul to review the life just ended. | `NEWTON-1994` | C | `light.council` |
| `L-BETWEEN-03` | Accounts describe previewing possible next bodies and circumstances before birth, and choosing among them. | `NEWTON-1994` | C | `market.parents`, `market.body`, `market.place` |
| `L-BETWEEN-04` | Accounts describe life difficulties as planned before birth, chosen for what they would teach. | `SCHWARTZ-2009` | C | `market.trauma` |
| `L-BETWEEN-05` | Agreements with other souls to meet in the coming life, in specific roles, are described. | `SCHWARTZ-2009`, `NEWTON-1994` | C | `market.contracts` |

Design note on tone: `L-BETWEEN-04` is the entire basis of the Trauma aisle, and
of GAME_BRIEF.md's instruction that it feel sacred rather than grim — "like
choosing which mountain to climb". The source frames chosen hardship as
deliberate and purposeful, so the aisle's copy should be plain and respectful,
never pitying. Writing a loss as a bargain the soul drives, rather than a
punishment it receives, is what keeps it on the right side of that line.

## 9. The Bardo Thödol — clear light, visions, rebirth

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-BARDO-01` | The after-death interval is structured as three successive bardos: the moment of death, the experience of reality, and becoming or rebirth. | `BARDO` | T | overall Act 2 shape |
| `L-BARDO-02` | At death a clear, primordial light dawns; recognising it is liberation, and failing to recognise it moves the traveller on. | `BARDO` | T | `threshold.being-of-light` |
| `L-BARDO-03` | Peaceful visions are met first, wrathful ones later; both are taught to be projections of the traveller's own mind, not external beings. | `BARDO` | T | `threshold.loved-ones`, `refuse.lower-sphere` |
| `L-BARDO-04` | In the final bardo the traveller is drawn toward rebirth and the text instructs on choosing a womb. | `BARDO` | T | `light.rebirth` |

Design note: `L-BARDO-03` is the single most useful idea in this file for Path B.
It makes the lower spheres *the player's own material*, which is exactly what
GAME_BRIEF.md § Platform asks for when it says geometry decays around the
player's attachments. It also converges with `FRANCHEZZO-1896` (§ 11) from an
entirely unrelated tradition, which is why the game can lean on it hard.

`L-BARDO-02` gives the ENTER / REFUSE choice its weight: in the source, failing
to enter the light is not punished — it simply moves the traveller into a longer
road. Path B should carry that flavour rather than feeling like the bad ending.

## 10. The Myth of Er and the weighing of the heart

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-ER-01` | Souls awaiting rebirth are presented with lots and choose their next lives themselves; the order of choosing is allotted, but the choice is the soul's own. | `PLATO-ER` | T | `market.*` |
| `L-ER-02` | The chooser bears responsibility for the choice: in Plato's phrasing the blame belongs to the one who chooses, not to a god. | `PLATO-ER` | T | `market.checkout` |
| `L-ER-03` | Souls who choose by habit, without examining the lot, choose badly — one famously takes a tyrant's life and only then sees what it contains. | `PLATO-ER` | T | `market.gifts` |
| `L-ER-04` | Before rebirth the souls camp on the plain of Forgetfulness (Lethe) and drink from the river of Carelessness (Ameles); all memory goes. | `PLATO-ER` | T | `light.river-of-forgetting` |
| `L-ER-05` | The heart of the dead is weighed in a balance against the feather of Maat; Anubis tends the scales, Thoth records the result, and a devourer waits for the heart that fails. | `EGYPT-BD` | T | `light.council` |

Design note: `L-ER-03` is the source for GAME_BRIEF.md's warning that a cart of
only gifts teaches little — and the better warning, because in Plato the
all-gifts choice is not forbidden, it is simply made by someone who did not look.
The guides should let the player take that cart, and the preview should have
shown them what was in it.

`L-ER-02` settles a design question the brief leaves open: when unresolved karma
puts a lesson in the cart that cannot be put back, that is not the guides
punishing the player. The weighing in `L-ER-05` is a reading of what is already
there, not a sentence imposed.

## 11. Franchezzo — the spheres, the spirit body, and rising by rescue

`FRANCHEZZO-1896` is the cosmology of Path B. It is a 19th-century spiritualist
text presented as dictated by a spirit to a transcriber — tier **C**, and its
own framing. Its value is that it is a *complete, internally consistent* account
of a soul moving through the lower regions by serving others, which is precisely
what Path B needs.

| Claim | Statement | Source | Tier | Scene |
| --- | --- | --- | --- | --- |
| `L-FRAN-01` | The narrator dies unrepentant and refuses rest, then wanders rather than ascending — the premise of Path B. | `FRANCHEZZO-1896` Ch. I–II ("My Death", "Despair"), pp. 1–11 | C | `refuse.earthbound` |
| `L-FRAN-02` | The cosmology is seven spheres above the earth and seven below it, with the earth plane between. | `FRANCHEZZO-1896` Ch. XXXIII ("My Vision of the Spheres"), p. 288; stated earlier in Part II | C | sphere progression |
| `L-FRAN-03` | The spirit body is the soul's own record: it is described as starved, cramped or neglected in proportion to the life lived, and its state is visible to others. | `FRANCHEZZO-1896` Ch. I, and recurring through Part I | C | spirit-body shader |
| `L-FRAN-04` | The landscape of each region is shaped by the dominant passion of those in it — named regions include the Valley of Selfishness, the Country of Unrest, the Miser's Land and the Gambler's Land. | `FRANCHEZZO-1896` Ch. VI ("Twilight Lands"), p. 41 | C | `refuse.lower-sphere` |
| `L-FRAN-05` | A Brotherhood of Hope works downward into the dark regions to reach bound souls; the narrator joins it and rises by that work rather than by merit claimed. | `FRANCHEZZO-1896` Ch. IV ("The Brotherhood of Hope"), p. 26 | C | `refuse.rescue` |
| `L-FRAN-06` | Suffering spirits are relieved by being "magnetised" by those further along, and those relieved later do the same for others — help propagates downward in a chain. | `FRANCHEZZO-1896` Part I | C | `refuse.rescue` |
| `L-FRAN-07` | Progress is marked by a second death: the shedding of a grosser body on leaving the Twilight Lands for the Land of Dawn. | `FRANCHEZZO-1896` Ch. XII ("My Second Death"), p. 79; Ch. XIII, p. 85 | C | sphere transition |
| `L-FRAN-08` | The higher lands are rendered in light, colour and music, and the text repeatedly says earthly language cannot carry them. | `FRANCHEZZO-1896` Part IV, esp. Ch. XXVIII ("My Home and Work in the Morning Land"), p. 247; Ch. XXXII, p. 275 | C | `refuse.higher-sphere`, `refuse.city-of-light` |
| `L-FRAN-09` | An astral plane between earth and the spheres is populated by non-human entities, described as spooks, elves and vampires. | `FRANCHEZZO-1896` Ch. XVII, p. 103 | C | unassigned — see § 12 |

Design notes:

- `L-FRAN-03` is the source GAME_BRIEF.md credits as "Franchezzo's core idea":
  the emissive spirit body whose brightness and colour report karma. Worth noting
  that in the source the reading runs the other way from a HUD — other spirits
  can see the narrator's state before he can. A scene where another figure
  reacts to the player's body before the player has seen it would be using the
  source rather than decorating with it.
- `L-FRAN-05` and `L-FRAN-06` give Path B its progression without combat. The
  chain in `L-FRAN-06` is the better mechanic: a rescued soul later rescues
  someone else, so the player's effect propagates past the moment of the rescue.
  That is HARMONY, mechanically — contribution to balance rather than a counter
  of good deeds.
- `L-FRAN-02` conflicts with nothing in the brief but is more specific than it.
  Seven above and seven below is a lot of scenes; the manifest in
  `src/game/manifest.ts` currently plans three lower and two higher. Treat
  fourteen as the fiction's shape, not a build target.
- `L-FRAN-04` names four passion-shaped regions. The brief's instruction that
  geometry decays around the player's attachments is the same idea generalised:
  rather than shipping the Miser's Land as a fixed place, derive the region from
  what the player's run actually accumulated.

## 12. Open inventions and unresolved questions

Recorded so that nothing invented is later mistaken for sourced.

1. **WILL as a resource.** No source quantifies anything like it.
   `FRANCHEZZO-1896` describes effort, exhaustion and being unable to move
   between regions, which is the flavour; the resource is the game's invention.
2. **Karma priced against gifts and challenges.** The economy of
   GAME_BRIEF.md § The Life Market is wholly the game's. `L-BETWEEN-03`,
   `L-BETWEEN-04` and `L-ER-01` support *choosing*; none prices anything.
3. **HARMONY as a second axis.** Invented. Its closest support is `L-FRAN-06`.
4. **The Market as a market.** The shopping metaphor is the game's, and is the
   one place where it deliberately departs from every source's register. Worth
   keeping deliberately: the wonder in GAME_BRIEF.md § The Life Market comes
   from the collision between a mundane frame and sacred stakes.
5. **Where `L-FRAN-09`'s astral entities belong.** Non-human entities sit
   awkwardly between Franchezzo's astral plane and the DMT hyperspace of
   `L-DMT-03`. Unassigned for now; collapsing them into one population would be
   a lore decision worth making consciously rather than by accident.

   *Decided, consciously, when `dmt.hyperspace` was built:* the entities in that
   scene are built from `L-DMT-03` alone, and are **not** Franchezzo's astral
   population. They are geometric rather than figurative, they share the
   architecture's own symmetry, and the scene never claims they exist anywhere
   but there. `L-FRAN-09` stays unassigned. Two sources a century and a
   tradition apart both reporting non-human company is interesting; it is not
   evidence that they reported the *same* company, and the game should not spend
   that coincidence by accident. If the two are ever merged it should be a
   deliberate choice recorded here, not a side effect of needing a monster.
6. **The seven vignettes' link to starting attachment.** GAME_BRIEF.md says
   violent and unjust deaths start heavy. `L-PAST-03` shows violent deaths are
   where reported past-life cases cluster, and `L-ARREST-02` shows depth of
   experience was *not* predicted by medical severity — which is mild evidence
   against a tidy "worse death, heavier start" curve. Flagged as a tension to
   resolve in design, not a settled claim.

## 13. Representation — what the sources do and do not license

CLAUDE.md § Content rules govern the police shooting and the soldier's death: the
camera centres the dying person, and those doing the killing are never its subject. Nothing in this
file softens that, and no source here is a reason to depict either event in more
detail than the rule allows.

Two sources bear on it positively. `L-THRESH-07`'s life review is reported as
*felt from the other side*, which is a structural argument for the brief's
first-person-from-another's-view mechanic and against spectacle: the game's
camera is for inhabiting a person, not for watching one. And `L-PAST-03`'s
clustering of reported cases in violent and unfinished deaths is why these
deaths are in the game at all — they are where the material is, not an appetite
for them.

The injustice in these two vignettes is the subject. The violence is not.

---

*Maintenance: add a claim id before using a lore fact in code or copy. If a claim
turns out to be wrong, correct it here first and fix every citing site —
`grep -rn "L-[A-Z]*-[0-9]" src/` finds them.*
