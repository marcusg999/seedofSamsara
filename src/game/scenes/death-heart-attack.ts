import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { moteField, volumetricGlow } from '../systems/forms';

/**
 * Vignette 5 — the heart attack. Lore bible § 5 (`L-ARREST-01`…`L-ARREST-05`).
 *
 * A slice of an ordinary evening, then the death. The player should care about
 * this person before they die, so the first half of the sequence is nothing but a
 * room with a life in it: a second cup no one is coming for, a drawing on the
 * fridge, a radio no one is listening to.
 *
 * Death is conveyed through perception, not gore (CLAUDE.md § Content rules).
 * Nothing injures and nothing bleeds. What happens is that the room stops being
 * reachable: the heart stumbles, the light narrows, the air loses its top end,
 * colour drains, the view sinks and tilts, and then it is quiet.
 *
 * Judged against the atmosphere-and-pacing bar, which means the restraint is the
 * work: one room, one light, long holds, and almost no text.
 */

const WARM = GRAMMAR.living;
const COLD = GRAMMAR.dying;

/**
 * The player reaches the afterlife within three minutes (GAME_BRIEF.md § Act 1).
 *
 * The weight still sits in the first half, because caring about this man before
 * he dies is the whole job of the opening and it cannot be bought with incident.
 * But it is bought with less time than before: every beat here is trimmed rather
 * than any beat being cut, so the shape of the arc survives the shorter run.
 *
 * Authored length is 164s. The closing beat then holds for GRACE_SECONDS before
 * moving on by itself, so a player who simply watches still crosses over inside
 * three minutes, while a player who wants to go sooner always can.
 */
const BEATS: readonly Beat[] = [
  { id: 'settle', seconds: 18, caption: 'Tuesday. The kettle, again.' },
  { id: 'the-room', seconds: 22 },
  { id: 'second-cup', seconds: 20, caption: 'Two cups. He still sets out two.' },
  { id: 'the-drawing', seconds: 16, caption: 'She drew that the year she turned six.' },
  { id: 'first-twinge', seconds: 14 },
  { id: 'wrong', seconds: 16, caption: 'Something in his chest turns over.' },
  { id: 'grip', seconds: 15 },
  { id: 'going-down', seconds: 11 },
  { id: 'floor', seconds: 14 },
  { id: 'stillness', seconds: 18, caption: 'The kettle is still going.' },
  // Holds, so the last image is never snatched away — but not forever.
  { id: 'after', seconds: 1, hold: true },
];

/** How long the closing image holds before the scene moves on by itself. */
const GRACE_SECONDS = 10;

/**
 * What this death hands to the afterlife (GAME_BRIEF.md § Act 1): violent and
 * unjust deaths begin with heavy attachment, peaceful ones begin light. This one
 * is neither — sudden, alone, and carrying one unfinished thing — so it starts
 * low but not at nothing.
 *
 * Recorded as a design choice rather than a finding: lore bible § 12.6 notes
 * that `L-ARREST-02` found depth of experience did not track medical severity,
 * which is mild evidence against a tidy "worse death, heavier start" curve.
 */
const STARTING_ATTACHMENT = 0.25;

export const deathHeartAttackScene: SceneDefinition = {
  id: 'death.heart-attack',
  title: 'An ordinary evening',
  exits: [{ id: 'onward', label: 'Let go', to: 'threshold.pronounced-dead' }],
  contentNotes: ['A death from a heart attack, from inside the body. No gore.'],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, rng } = context;
    const room = new Group();
    scene.add(room);

    // --- materials ---------------------------------------------------------
    const wallMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x2a2429, roughness: 0.94, metalness: 0 }),
    );
    const floorMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x1d181c, roughness: 0.88, metalness: 0.02 }),
    );
    const woodMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.88, metalness: 0 }),
    );
    const tableMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x33261d, roughness: 0.82, metalness: 0 }),
    );
    const metalMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.34, metalness: 0.72 }),
    );
    const paperMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x9c8f78, roughness: 0.98, metalness: 0 }),
    );
    const ceramicMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xd8cec2,
        roughness: 0.42,
        metalness: 0.03,
        // A touch of self-lit warmth: the second cup is the whole
        // characterisation and must not disappear into the table's shadow.
        emissive: 0x3a2a1c,
        emissiveIntensity: 1,
      }),
    );

    // --- shell -------------------------------------------------------------
    const roomWidth = 5.4;
    const roomDepth = 6.2;
    const roomHeight = 2.7;

    const floorGeometry = resources.track(new PlaneGeometry(roomWidth, roomDepth));
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    room.add(floor);

    const ceiling = new Mesh(floorGeometry, wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight;
    room.add(ceiling);

    const wallSideGeometry = resources.track(new PlaneGeometry(roomDepth, roomHeight));
    const wallEndGeometry = resources.track(new PlaneGeometry(roomWidth, roomHeight));

    const backWall = new Mesh(wallEndGeometry, wallMaterial);
    backWall.position.set(0, roomHeight / 2, -roomDepth / 2);
    room.add(backWall);

    const frontWall = new Mesh(wallEndGeometry, wallMaterial);
    frontWall.position.set(0, roomHeight / 2, roomDepth / 2);
    frontWall.rotation.y = Math.PI;
    room.add(frontWall);

    const leftWall = new Mesh(wallSideGeometry, wallMaterial);
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    room.add(leftWall);

    const rightWall = new Mesh(wallSideGeometry, wallMaterial);
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    room.add(rightWall);

    // --- the window: the strongest shape in the room ------------------------
    // Light does the composition here. The window is a hard, cool rectangle in a
    // warm dim room, so the eye has somewhere to rest and the silhouettes read.
    const windowGeometry = resources.track(new PlaneGeometry(1.5, 1.15));
    const windowMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x8ab2d2,
        emissive: 0x5d87ad,
        emissiveIntensity: 1.1,
        roughness: 1,
      }),
    );
    const windowPane = new Mesh(windowGeometry, windowMaterial);
    windowPane.position.set(0, 1.62, -roomDepth / 2 + 0.02);
    room.add(windowPane);

    const outside = volumetricGlow(resources, { radius: 1.3, color: 0x7ea8cc, intensity: 0.45, softness: 2.4 });
    outside.mesh.position.set(0, 1.62, -roomDepth / 2 - 0.35);
    room.add(outside.mesh);

    const mullionGeometry = resources.track(new BoxGeometry(0.035, 1.18, 0.05));
    const mullion = new Mesh(mullionGeometry, woodMaterial);
    mullion.position.set(0, 1.62, -roomDepth / 2 + 0.05);
    room.add(mullion);

    const transomGeometry = resources.track(new BoxGeometry(1.54, 0.035, 0.05));
    const transom = new Mesh(transomGeometry, woodMaterial);
    transom.position.set(0, 1.62, -roomDepth / 2 + 0.05);
    room.add(transom);

    // --- counter, table, chairs --------------------------------------------
    const counterGeometry = resources.track(new BoxGeometry(roomWidth - 0.6, 0.9, 0.62));
    const counter = new Mesh(counterGeometry, woodMaterial);
    counter.position.set(0, 0.45, -roomDepth / 2 + 0.45);
    room.add(counter);

    const tableTopGeometry = resources.track(new BoxGeometry(1.5, 0.06, 0.95));
    const tableTop = new Mesh(tableTopGeometry, tableMaterial);
    tableTop.position.set(0.1, 0.76, 0.75);
    room.add(tableTop);

    const legGeometry = resources.track(new BoxGeometry(0.07, 0.76, 0.07));
    for (const [x, z] of [
      [-0.58, 0.36],
      [0.78, 0.36],
      [-0.58, 1.14],
      [0.78, 1.14],
    ] as const) {
      const leg = new Mesh(legGeometry, woodMaterial);
      leg.position.set(x + 0.1, 0.38, z);
      room.add(leg);
    }

    const chairSeatGeometry = resources.track(new BoxGeometry(0.46, 0.05, 0.46));
    const chairBackGeometry = resources.track(new BoxGeometry(0.46, 0.52, 0.05));
    for (const [x, z, facing] of [
      [-0.55, 0.75, Math.PI / 2],
      [0.78, 0.75, -Math.PI / 2],
    ] as const) {
      const chair = new Group();
      const seat = new Mesh(chairSeatGeometry, woodMaterial);
      seat.position.y = 0.46;
      chair.add(seat);
      const back = new Mesh(chairBackGeometry, woodMaterial);
      back.position.set(0, 0.72, -0.2);
      chair.add(back);
      for (const [lx, lz] of [
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ] as const) {
        const leg = new Mesh(legGeometry, woodMaterial);
        leg.position.set(lx, 0.23, lz);
        leg.scale.y = 0.6;
        chair.add(leg);
      }
      chair.position.set(x, 0, z);
      chair.rotation.y = facing;
      room.add(chair);
    }

    // --- the life in the room ----------------------------------------------
    // Two cups. The second one is the whole characterisation.
    const cupGeometry = resources.track(new CylinderGeometry(0.045, 0.038, 0.09, 18, 1, true));
    const cupA = new Mesh(cupGeometry, ceramicMaterial);
    cupA.position.set(-0.26, 0.84, 0.66);
    room.add(cupA);
    const cupB = new Mesh(cupGeometry, ceramicMaterial);
    cupB.position.set(0.46, 0.84, 0.84);
    room.add(cupB);

    // A child's drawing, pinned up. Read as a shape, never detailed.
    const drawingGeometry = resources.track(new PlaneGeometry(0.3, 0.38));
    const drawing = new Mesh(drawingGeometry, paperMaterial);
    drawing.position.set(-1.86, 1.42, -roomDepth / 2 + 0.03);
    drawing.rotation.z = 0.04;
    room.add(drawing);

    // The kettle, which outlasts him.
    const kettleGeometry = resources.track(new CylinderGeometry(0.1, 0.12, 0.2, 20));
    const kettle = new Mesh(kettleGeometry, metalMaterial);
    kettle.position.set(-1.1, 1.0, -roomDepth / 2 + 0.42);
    room.add(kettle);

    const steam = moteField(resources, rng.stream('steam'), {
      count: 90,
      radius: 0.3,
      color: 0xd8d2c8,
      size: 0.022,
    });
    steam.points.position.copy(kettle.position).add(new Vector3(0, 0.22, 0));
    room.add(steam.points);

    // --- light -------------------------------------------------------------
    const bulbGlow = volumetricGlow(resources, { radius: 0.3, color: 0xffcf96, intensity: 0.7, softness: 2.6 });
    bulbGlow.mesh.position.set(0.1, 2.1, 0.75);
    room.add(bulbGlow.mesh);

    // The light source has to be its own emitter. A standard material with the
    // point light inside it receives no light on its outer faces and renders as a
    // black disc in the middle of its own glow.
    const bulbShadeGeometry = resources.track(new SphereGeometry(0.05, 16, 12));
    const bulbMaterial = resources.track(new MeshBasicMaterial({ color: 0xffe2b4 }));
    const bulb = new Mesh(bulbShadeGeometry, bulbMaterial);
    bulb.position.copy(bulbGlow.mesh.position);
    room.add(bulb);

    const bulbLight = new PointLight(0xffc78a, 11, 10, 2);
    bulbLight.position.copy(bulbGlow.mesh.position);
    room.add(bulbLight);
    resources.onDispose(() => {
      bulbLight.dispose();
    });

    // Bounce: a dim warm floor-up and cool ceiling-down pair, so surfaces away
    // from the bulb still carry shape instead of going to pure black.
    const bounce = new HemisphereLight(0x6d7f99, 0x4a3328, 0.55);
    room.add(bounce);
    resources.onDispose(() => {
      bounce.dispose();
    });

    // A second practical under the counter, which gives the back of the room
    // depth and keeps the kettle readable.
    const counterLight = new PointLight(0xffb570, 2.2, 4.5, 2);
    counterLight.position.set(-1.1, 1.22, -roomDepth / 2 + 0.7);
    room.add(counterLight);
    resources.onDispose(() => {
      counterLight.dispose();
    });

    const windowLight = new DirectionalLight(0x8fb6d8, 1.35);
    windowLight.position.set(0.2, 3.2, -6);
    windowLight.target.position.set(0, 0.8, 1);
    room.add(windowLight);
    room.add(windowLight.target);
    resources.onDispose(() => {
      windowLight.dispose();
    });

    // --- state -------------------------------------------------------------
    const director = new Director(BEATS);
    const standingEye = 1.58;
    const floorEye = 0.22;

    context.rig.setMode('embodied');
    context.rig.position.set(0.25, standingEye, 2.35);
    // Angled down and slightly across, so the table, both cups and the window are
    // all in the opening frame and the room reads as inhabited.
    context.rig.orient(Math.PI * 0.02, -0.22);
    context.rig.setSway(1);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = WARM.drain;
    grade.grain = WARM.grain;
    grade.vignette = 0.38;
    grade.aberration = 0.0011;
    grade.distortion = 0.022;
    grade.exposure = 1.35;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(WARM.bloom, 0.55, 0.87);

    context.audio.room(0.3, 1400);
    context.audio.drone(0.09, 44);
    context.audio.heartbeat(true, 62, 0.34);

    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 6);
      }
    });

    // Per-beat targets. Keeping them as data rather than a switch in `update`
    // means the whole arc of the vignette is readable in one place.
    const BPM: Record<string, number> = {
      settle: 62,
      'the-room': 61,
      'second-cup': 60,
      'the-drawing': 59,
      'first-twinge': 74,
      wrong: 96,
      grip: 124,
      'going-down': 142,
      floor: 70,
      stillness: 22,
      after: 0,
    };

    let bodyDown = 0;
    let silenceFor = 0;
    let handedOver = false;
    // Wall-clock, not accumulated delta: the grace had the same frame-rate bug
    // the beat timeline did, and took 27s instead of 10 on a slow renderer.
    let holdBeganAt: number | undefined;
    let leaving = false;

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        bulbGlow.update(elapsed, context.camera);
        outside.update(elapsed, context.camera);
        steam.drift(delta, elapsed);

        // Heart rate rises through the attack, then falls away to nothing.
        const bpm = BPM[beat.id] ?? 60;
        const beating = bpm > 0;
        context.audio.heartbeat(beating, Math.max(1, bpm), beat.id === 'stillness' ? 0.5 : 0.34);

        // The camera pulse follows the heart, so the frame tightens with it.
        const pulseStrength = beat.id === 'settle' || beat.id === 'the-room'
          || beat.id === 'second-cup' || beat.id === 'the-drawing'
          ? 0.12
          : beat.id === 'first-twinge'
            ? 0.4
            : beat.id === 'wrong'
              ? 0.75
              : beat.id === 'grip'
                ? 1
                : beat.id === 'going-down'
                  ? 0.85
                  : 0.2;
        const beatPhase = beating ? (elapsed * (bpm / 60)) % 1 : 0;
        context.rig.setPulse(pulseStrength * Math.pow(1 - beatPhase, 6));

        // Perception narrows rather than the room changing: vignette closes,
        // colour leaves, the lens begins to disagree with itself.
        const distress = beat.id === 'first-twinge'
          ? t * 0.3
          : beat.id === 'wrong'
            ? 0.3 + t * 0.25
            : beat.id === 'grip'
              ? 0.55 + t * 0.3
              : beat.id === 'going-down' || beat.id === 'floor' || beat.id === 'stillness' || beat.id === 'after'
                ? 1
                : 0;

        grade.vignette = 0.38 + distress * 0.46;
        grade.drain = WARM.drain + (COLD.drain - WARM.drain) * distress;
        grade.aberration = 0.0011 + distress * 0.0042;
        grade.distortion = 0.022 + distress * 0.05;
        grade.grain = WARM.grain + distress * 0.1;
        grade.exposure = 1.35 - distress * 0.4;
        context.post.setBloom(WARM.bloom + distress * 0.5, 0.55, 0.42 - distress * 0.22);

        // The air loses its high end: sound dropping out, not fading down.
        context.audio.room(0.3 - distress * 0.16, 1400 - distress * 1180);
        context.audio.drone(0.09 + distress * 0.1, 44 - distress * 10);

        // Going down. The view sinks and the horizon rolls, which is the body
        // falling without ever showing a body falling.
        if (beat.id === 'going-down') {
          bodyDown = ease.inOut(t);
        } else if (beat.id === 'floor' || beat.id === 'stillness' || beat.id === 'after') {
          bodyDown = 1;
        }
        context.rig.position.set(
          0.25 + bodyDown * 0.1,
          standingEye + (floorEye - standingEye) * bodyDown,
          1.95 - bodyDown * 0.55,
        );
        context.rig.setRoll(bodyDown * 0.62);
        context.rig.setSway(1 - bodyDown * 0.85);

        // The vertical smear is the one overtly unreal effect, and it is spent
        // in about three seconds at the moment the body gives out.
        grade.smear = beat.id === 'going-down' ? ease.pulse(t) * 0.05 : 0;

        // Then the ring, which is the first thing that belongs to what comes next.
        if (beat.id === 'stillness' || beat.id === 'after') {
          silenceFor += delta;
          context.audio.ring(Math.min(0.2, silenceFor * 0.04), 2100 + silenceFor * 60);
          context.captions.update();
        } else {
          context.audio.ring(0, 2100);
        }

        // The death sets the opening state of the afterlife, once, as it ends.
        if (!handedOver && (beat.id === 'stillness' || beat.id === 'after')) {
          handedOver = true;
          context.soul.attachment = STARTING_ATTACHMENT;
          // Will is what Path B spends to move between spheres; a soul arriving
          // heavy arrives with less of it.
          context.soul.will = 1 - STARTING_ATTACHMENT * 0.5;
        }

        // The exit is live from the first frame: the player is never held here.
        // And if they do nothing, the scene lets go on their behalf rather than
        // leaving them sitting in a dead room past the three-minute mark.
        if (beat.id === 'after' && t >= 1) {
          context.captions.show('Let go.', 8);
          holdBeganAt ??= elapsed;
          if (!leaving && elapsed - holdBeganAt >= GRACE_SECONDS) {
            leaving = true;
            void context.takeExit('onward');
          }
        }
      },
      beat() {
        const state = director.state;
        return { id: state.beat.id, index: state.index, t: state.t, finished: state.finished };
      },
      advance() {
        director.advance();
      },
    };
  },
};
