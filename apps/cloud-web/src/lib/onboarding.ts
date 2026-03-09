const GETTING_STARTED_DISMISSED_KEY = "cronlet.getting-started-dismissed";
const FIRST_TASK_PENDING_KEY = "cronlet.first-task-pending";
const FIRST_TASK_SUCCESS_SEEN_KEY = "cronlet.first-task-success-seen";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, "true");
  } else {
    window.localStorage.removeItem(key);
  }
}

export function isGettingStartedDismissed(): boolean {
  return readFlag(GETTING_STARTED_DISMISSED_KEY);
}

export function setGettingStartedDismissed(value: boolean): void {
  writeFlag(GETTING_STARTED_DISMISSED_KEY, value);
}

export function isFirstTaskPending(): boolean {
  return readFlag(FIRST_TASK_PENDING_KEY);
}

export function setFirstTaskPending(value: boolean): void {
  writeFlag(FIRST_TASK_PENDING_KEY, value);
}

export function hasSeenFirstTaskSuccess(): boolean {
  return readFlag(FIRST_TASK_SUCCESS_SEEN_KEY);
}

export function markFirstTaskSuccessSeen(): void {
  writeFlag(FIRST_TASK_SUCCESS_SEEN_KEY, true);
  writeFlag(FIRST_TASK_PENDING_KEY, false);
}
