/**
 * Ready-made programmes. The ids are stored with each session (the server keeps ids only): never rename
 * an id, add a new one instead.
 */
export interface Exercise {
  id: string;
  name: { fr: string; en: string };
  sets: number;
  /** repetitions, or seconds when `seconds` is set */
  reps?: number;
  seconds?: number;
  perSide?: boolean;
  /** a load can be noted (gym exercises) */
  weighted?: boolean;
  rest: number;
}

export interface Workout {
  id: string;
  name: { fr: string; en: string };
  exercises: Exercise[];
}

export interface Program {
  id: string;
  name: { fr: string; en: string };
  text: { fr: string; en: string };
  perWeek: number;
  emoji: string;
  workouts: Workout[];
}

const ex = (
  id: string,
  fr: string,
  en: string,
  sets: number,
  amount: { reps?: number; seconds?: number },
  rest: number,
  opts: { perSide?: boolean; weighted?: boolean } = {},
): Exercise => ({ id, name: { fr, en }, sets, ...amount, rest, ...opts });

export const PROGRAMS: Program[] = [
  {
    id: 'full-body',
    name: { fr: 'Full body débutant', en: 'Beginner full body' },
    text: {
      fr: 'Tout le corps à chaque séance, deux séances qui alternent. Idéal pour démarrer en salle',
      en: 'The whole body every time, two alternating workouts. Ideal to start at the gym',
    },
    perWeek: 3,
    emoji: '🏋️',
    workouts: [
      {
        id: 'a',
        name: { fr: 'Séance A', en: 'Workout A' },
        exercises: [
          ex('goblet-squat', 'Squat gobelet', 'Goblet squat', 3, { reps: 10 }, 90, { weighted: true }),
          ex('push-up', 'Pompes', 'Push-ups', 3, { reps: 10 }, 75),
          ex('db-row', 'Rowing haltère', 'Dumbbell row', 3, { reps: 10 }, 75, { perSide: true, weighted: true }),
          ex('hip-thrust', 'Hip thrust', 'Hip thrust', 3, { reps: 12 }, 75, { weighted: true }),
          ex('plank', 'Gainage', 'Plank', 3, { seconds: 30 }, 45),
        ],
      },
      {
        id: 'b',
        name: { fr: 'Séance B', en: 'Workout B' },
        exercises: [
          ex('lunge', 'Fentes', 'Lunges', 3, { reps: 10 }, 75, { perSide: true, weighted: true }),
          ex('db-bench', 'Développé couché haltères', 'Dumbbell bench press', 3, { reps: 10 }, 90, { weighted: true }),
          ex('lat-pulldown', 'Tirage vertical', 'Lat pulldown', 3, { reps: 10 }, 75, { weighted: true }),
          ex('rdl', 'Soulevé de terre jambes tendues', 'Romanian deadlift', 3, { reps: 10 }, 90, { weighted: true }),
          ex('side-plank', 'Gainage latéral', 'Side plank', 3, { seconds: 20 }, 45, { perSide: true }),
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: { fr: 'Haut / bas', en: 'Upper / lower' },
    text: {
      fr: 'Le haut du corps, puis le bas, en alternance. Pour progresser une fois les bases acquises',
      en: 'Upper body, then lower body, in turn. To progress once the basics are there',
    },
    perWeek: 4,
    emoji: '💪',
    workouts: [
      {
        id: 'upper',
        name: { fr: 'Haut du corps', en: 'Upper body' },
        exercises: [
          ex('bench-press', 'Développé couché', 'Bench press', 4, { reps: 8 }, 120, { weighted: true }),
          ex('cable-row', 'Tirage horizontal', 'Seated cable row', 4, { reps: 10 }, 90, { weighted: true }),
          ex('shoulder-press', 'Développé épaules', 'Shoulder press', 3, { reps: 10 }, 90, { weighted: true }),
          ex('lat-pulldown', 'Tirage vertical', 'Lat pulldown', 3, { reps: 10 }, 75, { weighted: true }),
          ex('curl', 'Curl biceps', 'Biceps curl', 3, { reps: 12 }, 60, { weighted: true }),
          ex('triceps', 'Extension triceps', 'Triceps extension', 3, { reps: 12 }, 60, { weighted: true }),
        ],
      },
      {
        id: 'lower',
        name: { fr: 'Bas du corps', en: 'Lower body' },
        exercises: [
          ex('squat', 'Squat', 'Squat', 4, { reps: 8 }, 120, { weighted: true }),
          ex('rdl', 'Soulevé de terre jambes tendues', 'Romanian deadlift', 3, { reps: 10 }, 90, { weighted: true }),
          ex('leg-press', 'Presse à cuisses', 'Leg press', 3, { reps: 12 }, 90, { weighted: true }),
          ex('leg-curl', 'Leg curl', 'Leg curl', 3, { reps: 12 }, 60, { weighted: true }),
          ex('calf-raise', 'Mollets debout', 'Standing calf raise', 3, { reps: 15 }, 45, { weighted: true }),
          ex('plank', 'Gainage', 'Plank', 3, { seconds: 40 }, 45),
        ],
      },
    ],
  },
  {
    id: 'home',
    name: { fr: 'À la maison, sans matériel', en: 'At home, no equipment' },
    text: {
      fr: 'Un circuit de 25 minutes avec ton poids du corps, dans ton salon',
      en: 'A 25-minute bodyweight circuit, in your living room',
    },
    perWeek: 3,
    emoji: '🏠',
    workouts: [
      {
        id: 'circuit',
        name: { fr: 'Circuit', en: 'Circuit' },
        exercises: [
          ex('air-squat', 'Squats', 'Air squats', 4, { reps: 15 }, 30),
          ex('push-up', 'Pompes', 'Push-ups', 4, { reps: 10 }, 30),
          ex('glute-bridge', 'Pont fessier', 'Glute bridge', 4, { reps: 15 }, 30),
          ex('mountain-climber', 'Mountain climbers', 'Mountain climbers', 4, { seconds: 30 }, 30),
          ex('plank', 'Gainage', 'Plank', 4, { seconds: 30 }, 30),
          ex('jumping-jack', 'Jumping jacks', 'Jumping jacks', 4, { seconds: 40 }, 45),
        ],
      },
    ],
  },
];

export function program(id: string | null | undefined): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

export function workout(programId: string, workoutId: string): Workout | undefined {
  return program(programId)?.workouts.find((w) => w.id === workoutId);
}
