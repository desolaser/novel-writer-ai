/** Tail of the queue of operations, per file. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Runs `task` once every earlier task for the same file has finished.
 *
 * For JSON files that are read, patched and written back whole (one chat per
 * file). Two overlapping updates used to make the later one drop the earlier
 * one: renaming a chat while its reply was being saved lost the reply.
 *
 * `task` must not take the lock of the same file again: it would wait for
 * itself forever.
 */
export function withFileLock<T>(path: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(path) ?? Promise.resolve();
	const run = previous.then(task);
	// The queue only orders tasks; a failed one must not block the next.
	const tail = run.catch(() => undefined);
	queues.set(path, tail);
	void tail.then(() => {
		if (queues.get(path) === tail) queues.delete(path);
	});
	return run;
}
