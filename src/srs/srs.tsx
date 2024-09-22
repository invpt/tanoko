import { IDBPDatabase, openDB } from "idb";
import { Component, createContext, createEffect, createSignal, onCleanup, ParentProps, useContext } from "solid-js";

export type SrsEntryType = "jmdict-vocab";

export type SrsState = {
  [type in SrsEntryType]: {
    [id: string]: {
      history: SrsReviewHistory;
    };
  };
};

export type SrsReviewHistory = {
  time: Date,
  success: boolean,
}[];

type StateSnapshot = {
  [type in SrsEntryType]: {
    [id: string]: {
      history: SrsReviewHistory,
      nextReview: Date,
    }
  }
};

export type SrsSnapshot = {
  soonestReview?: Date,
  availableReviews: { type: SrsEntryType, id: string }[],
  state: StateSnapshot,
};

const objectStoreName = "srs";
const keyName = "main";

type DbTypes = {
  [objectStoreName]: {
    key: string,
    value: SrsState,
  },
};

export class SrsDb {
  private db: IDBPDatabase<DbTypes>;
  private reviewsListeners: ((summary: SrsSnapshot) => void)[] = [];
  private latestReviewsSnapshot: SrsSnapshot;

  private constructor(db: IDBPDatabase<DbTypes>, latestReviewsSnapshot: SrsSnapshot) {
    this.db = db;
    this.latestReviewsSnapshot = latestReviewsSnapshot;
  }

  static async open() {
    const db = await openDB<DbTypes>(objectStoreName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(objectStoreName)) {
          db.createObjectStore(objectStoreName);
        }
      },
    });

    const reviewsSnapshot = computeSnapshot(new Date(), await db.get(objectStoreName, keyName) ?? {} as SrsState);

    return new SrsDb(db, reviewsSnapshot);
  }

  snapshot() {
    return this.latestReviewsSnapshot;
  }

  addReviewsListener(callback: (summary: SrsSnapshot) => void) {
    this.reviewsListeners.push(callback);
  }

  removeReviewsListener(callback: (summary: SrsSnapshot) => void) {
    this.reviewsListeners.splice(this.reviewsListeners.indexOf(callback), 1);
  }

  private updateReviewsSummary(summary: SrsSnapshot) {
    this.latestReviewsSnapshot = summary;
    for (const listener of this.reviewsListeners) {
      listener(summary);
    }
  }

  async add(type: SrsEntryType, id: string) {
    const store = this.db.transaction(objectStoreName, "readwrite").objectStore(objectStoreName);
    const state = await store.get(keyName) ?? {} as SrsState;
    const newState = {
      ...state,
      [type]: {
        ...state[type] ?? {},
        [id]: {
          history: []
        },
      },
    };
    await store.put(newState, keyName);
    this.updateReviewsSummary(computeSnapshot(new Date(), newState));
  }

  async review(type: SrsEntryType, id: string, success: boolean) {
    const store = this.db.transaction(objectStoreName, "readwrite").objectStore(objectStoreName);
    const state = await store.get(keyName) ?? {} as SrsState;
    const newState = {
      ...state,
      [type]: {
        ...state[type] ?? {},
        [id]: {
          history: [
            ...state[type]?.[id]?.history ?? [],
            {
              time: new Date(),
              success,
            },
          ],
        },
      },
    };
    await store.put(newState, keyName);
    this.updateReviewsSummary(computeSnapshot(new Date(), newState));
  }
}

function computeSnapshot(now: Date, state: SrsState): SrsSnapshot {
  let soonest: Date | undefined = undefined;
  const available: { type: SrsEntryType, id: string, reviewTime: Date }[] = [];
  const stateSnapshot: StateSnapshot = {
    "jmdict-vocab": {},
  };
  for (const typeString of Object.keys(state)) {
    const type = typeString as SrsEntryType;
    for (const id of Object.keys(state[type])) {
      const entry = state[type][id];
      const reviewTime = nextReview(entry.history);
      if (reviewTime === undefined || reviewTime.getTime() <= now.getTime()) {
        available.push({ type, id, reviewTime: reviewTime ?? now });
      }
      if (soonest === undefined || (reviewTime ?? now).getTime() < soonest.getTime()) {
        soonest = reviewTime ?? now;
      }
      stateSnapshot[type][id] = {
        history: entry.history,
        nextReview: reviewTime ?? now,
      };
    }
  }

  available.sort((a, b) => a.reviewTime.getTime() - b.reviewTime.getTime());

  return { soonestReview: soonest, availableReviews: available, state: stateSnapshot };
}

function nextReview(history: SrsReviewHistory) {
  let stage = 0;
  let time: Date | undefined = undefined;
  for (const review of history) {
    if (review.success) {
      stage += 1;
      time = review.time;
    } else {
      stage = Math.max(0, stage - 2);
      time = review.time;
    }
  }

  if (stage === 0 || time == null) {
    return undefined;
  }

  const base = 30 * 60 * 1000;
  const millisAfter = base << (2 * (stage - 1));
  return new Date(time.getTime() + millisAfter);
}

const SrsContext = createContext<Srs>();

export type SrsSnapshotResult = {
  status: "loading",
} | {
  status: "success",
  snapshot: SrsSnapshot,
} | {
  status: "failure",
  error: unknown,
};

export type Srs = {
  snapshot: () => SrsSnapshotResult,
  add: (type: SrsEntryType, id: string) => Promise<void>,
  review: (type: SrsEntryType, id: string, success: boolean) => Promise<void>,
};

export function useSrs(): Srs {
  const srs = useContext(SrsContext);
  if (srs === undefined) {
    throw new Error("Cannot useSrs() outside of SrsProvider");
  }

  return srs;
}

export const SrsProvider: Component<ParentProps> = (props) => {
  const dbPromise = SrsDb.open();

  const [snapshot, setSnapshot] = createSignal<SrsSnapshotResult>({ status: "loading" });

  createEffect(async () => {
    let cleanupFn = () => {};
    onCleanup(() => cleanupFn());

    try {
      const db = await dbPromise;
      setSnapshot({ status: "success", snapshot: db.snapshot() });
      const listener = (snapshot: SrsSnapshot) => setSnapshot({ status: "success", snapshot });
      db.addReviewsListener(listener);
      cleanupFn = () => db.removeReviewsListener(listener);
    } catch (error) {
      console.error("Failed to set up reviews listener", error);
      setSnapshot({ status: "failure", error });
    }
  });

  return (
    <SrsContext.Provider value={{
      snapshot,
      async add(type, id) {
        const db = await dbPromise;
        await db.add(type, id);
      },
      async review(type, id, success) {
        const db = await dbPromise;
        await db.review(type, id, success);
      },
    }}>
      {props.children}
    </SrsContext.Provider>
  );
};

