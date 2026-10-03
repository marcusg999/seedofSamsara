# GAME_BRIEF — Seed of Samsara

## Premise
You die. What happens next depends on how you died, what you carried with you,
and what you choose at the edge of the Light. Every run is one life and one death.
Reincarnation is the loop. Wisdom is what carries over.

## Platform and art direction
Browser, three.js / WebGL, desktop first, mobile playable.
Surreal and psychedelic, with the visuals carrying the metaphysics.
Tonal range is a requirement. The lower spheres must genuinely unsettle; the Light
must genuinely overwhelm. A game that is only pretty fails.
- Death vignettes start grounded and lightly stylized. At the moment of death,
  reality warps: color drains, geometry stretches, sound drops out.
- The Threshold uses a living tunnel shader, light that has texture and weight,
  and figures that resolve out of glow.
- The DMT vignette breaks into raymarched fractal hyperspace and shifting
  geometric architecture, with entities that feel aware of the player.
- Lower spheres: desaturated fog, heavy grain, geometry that decays around the
  player's attachments.
- Higher spheres: hues that seem beyond the normal spectrum, refraction,
  architecture made of sound and light.
- The player's spirit body is emissive; its brightness and color reflect karma,
  so the world shows the soul's state (Franchezzo's core idea).
Post-processing (bloom, chromatic aberration, distortion) is a tool, not wallpaper.
Each sphere has its own visual grammar.

## Quality bars (each piece is judged against the one that fits it)
- Messenger by Abeto (https://messenger.abeto.co/): controls, camera, polish,
  performance. Played live in a browser.
- Playdead's Inside: death vignettes and lower spheres. Gameplay footage.
- Journey: Threshold, the Light, higher spheres, Life Market. Gameplay footage.

## Research the game must be built on (pull these, cite them in research/lore-bible.md)
- Raymond Moody, Life After Life (1975): the recurring NDE elements structure the Threshold.
- Bruce Greyson, NDE Scale (1983); Greyson & Bush (1992) on distressing NDEs
  (the void, inverted or hellish experiences): these build the lower spheres.
- Pim van Lommel et al., The Lancet (2001), cardiac-arrest NDE study; Sam Parnia's
  AWARE studies: grounding for the heart-attack vignette and the out-of-body view.
- Timmermann et al. (2018), DMT experiences compared with NDEs on the Greyson scale;
  Rick Strassman, DMT: The Spirit Molecule.
- Ian Stevenson and Jim Tucker (UVA) on children's past-life memories, including
  birthmarks that match a previous life's death wound.
- Michael Newton, Journey of Souls: soul groups, guides, a council, previewing the next body.
- Robert Schwartz, Your Soul's Plan: pre-birth planning of life challenges.
- The Bardo Thödol (Tibetan Book of the Dead): the clear light, peaceful and wrathful
  visions, the choice of rebirth.
- Plato, Republic Book X, the Myth of Er: souls choose their lots, then drink from
  the river of forgetting.
- Egyptian Book of the Dead: the weighing of the heart.
- Franchezzo, A Wanderer in the Spirit Lands (1896), full text:
  https://archive.org/stream/wandererinspirit1896fran/wandererinspirit1896fran_djvu.txt
  A spirit who refuses rest, wanders dark lower regions shaped by his own passions
  and attachments, and rises by serving and rescuing other lost souls.

## Act 1 — The Death Vignettes (first person, under 3 minutes each)
Each vignette is a slice of a specific person's life, then their death. The player
should care about this person before they die.
1. Car crash
2. Fall from a cliff while hiking
3. Shot by a police officer
4. Killed in a bomb blast
5. Heart attack
6. Lynched by a group of racist men
7. Smoke DMT (the edge case: the player may be sent back, the classic
   "it is not your time" NDE, which unlocks an alternate thread)

Pacing rule: the player reaches the afterlife within three minutes. The vignette
holds its closing image briefly and then lets go by itself, so a player who only
watches still crosses over in time, and a player who wants to go sooner always can.

Treatment rule: death is conveyed through perception, not gore. Time slows, sound
drops out, color drains, then the camera lifts out of the body and sees the scene
from above. The police shooting and the lynching center the victim's humanity and
the injustice; the perpetrators are never the camera's subject. Content notes appear
before the game, and the player chooses a vignette or takes a random death.

Each death sets the starting state of the afterlife: violent, unjust deaths begin
with heavy attachment (rage, fear, unfinished business); peaceful deaths begin light.

## Act 2 — The Threshold (built from Moody's elements)
Hearing yourself pronounced dead, the buzzing or ringing, the out-of-body view,
the tunnel, deceased loved ones and guides, the Being of Light, the border.
Then the core choice: ENTER THE LIGHT or REFUSE IT.

## Path A — The Light
- Life Review: the player re-lives key moments from the other people's point of
  view and feels what they felt. This is the moral engine of the game.
- The Council: guides weigh the life (heart against the feather).
- The Life Market (below), then the River of Forgetting and rebirth.

## The Life Market (Path A, after the life review)
The soul shops for its next life the way you'd shop for groceries, in a vast,
surreal, glowing market. Grounded in the Myth of Er (souls choose their lots),
Michael Newton's accounts of souls previewing future bodies, and Robert Schwartz's
"pre-birth planning" (souls choosing challenges in advance for growth).

Aisles:
- Parents: each pair is shelved as a living diorama. Pick one up to glimpse
  a moment of the childhood they'd give you.
- Body and avatar: species, form, health, appearance, and any birthmark
  carried from a past death.
- Gifts: talents, beauty, intellect, charisma, artistry, intuition.
- Trauma and challenges: loss, illness, abandonment, addiction in the family,
  injustice. These are the lessons the soul chooses to face.
- Economic circumstance: from struggle to abundance, each with its own lessons.
- Place: planet, culture, era.
- Soul contracts: people from your soul group who agree to meet you in the
  next life as a friend, rival, lover or teacher.

Economy: gifts cost karma; challenges repay karma debt and earn growth.
The life review sets the shopping list, so unresolved karma from the last life
puts certain lessons in the cart that can't be put back. A cart full of gifts
and no challenges is allowed, but the guides warn that such a life teaches little.

Preview: holding any item plays a short sensory flash of that life.
Checkout: the cart is weighed (the heart against the feather). The guides
speak once. Then the soul walks to the River of Forgetting, and the cart's
contents become the opening conditions of the next run.

Tone: wonder and weight at once. The Trauma aisle should feel sacred, not
grim, like choosing which mountain to climb.

## Path B — Refusing the Light
- WILL is the core resource: it powers movement between spheres and resists the
  pull of lower ones.
- The environment reflects the soul: landscape, light and the spirit body are
  shaped by the player's deeds and attachments.
- Lower spheres: mist, the void, earthbound haunting of the living.
- Higher spheres: cities of light, color and music beyond the earthly range.
- Rising happens through rescue: freeing other bound souls (Franchezzo's
  Brotherhood of Hope), not through combat.

## Systems
- KARMA: the player's personal ledger, measured by effect on others as felt in
  the review, not by a good/evil meter.
- HARMONY: the player's contribution to the balance of the universe; rises through
  rescue, forgiveness, release.
- PAST LIVES: memory shards on both paths reveal earlier incarnations. A past
  life's death wound can carry over as the next avatar's birthmark.
- META-PROGRESSION: each run is a life. Wisdom and unlocked memories persist across
  runs; specifics fade.

## Quality gates
Zero console errors, zero uncaught exceptions, zero WebGL warnings, zero softlocks
across an automated playthrough of all seven vignettes, both paths and every Life
Market checkout. Every change re-runs the gate. See CLAUDE.md.
