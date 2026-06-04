/**
 * Map-Reduce style split + ring-buffer round-robin across active devices.
 * Uses in-memory workload map (synced from MongoDB device records).
 */

export class LoadBalancer {
  /** @type {Map<string, { assigned: number, inProgress: number, completed: number }>} */
  #workloadMap = new Map();
  #ring = [];
  #ringIndex = 0;

  syncFromDevices(devices) {
    this.#workloadMap.clear();
    const active = devices.filter((d) => d.isActive && d.fcmToken);
    for (const d of active) {
      this.#workloadMap.set(d.deviceId, {
        assigned: d.workload?.assigned ?? 0,
        inProgress: d.workload?.inProgress ?? 0,
        completed: d.workload?.completed ?? 0,
      });
    }
    this.#ring = active.map((d) => d.deviceId);
    this.#ringIndex = 0;
    return active;
  }

  /** Pick device with lowest effective load (assigned + inProgress - completed weight). */
  #pickLeastLoaded() {
    if (this.#ring.length === 0) return null;

    let bestId = null;
    let bestScore = Infinity;

    for (const deviceId of this.#ring) {
      const w = this.#workloadMap.get(deviceId);
      if (!w) continue;
      const score = w.assigned + w.inProgress * 2 - w.completed * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestId = deviceId;
      }
    }

    if (bestId) return bestId;

    const id = this.#ring[this.#ringIndex % this.#ring.length];
    this.#ringIndex = (this.#ringIndex + 1) % this.#ring.length;
    return id;
  }

  /**
   * Split numbers evenly among active devices (no duplicates).
   * @returns {Map<string, string[]>} deviceId -> numbers
   */
  distribute(numbers, activeDeviceIds) {
    const buckets = new Map();
    for (const id of activeDeviceIds) {
      buckets.set(id, []);
      if (!this.#workloadMap.has(id)) {
        this.#workloadMap.set(id, { assigned: 0, inProgress: 0, completed: 0 });
      }
    }

    if (activeDeviceIds.length === 0) {
      return buckets;
    }

    this.#ring = [...activeDeviceIds];

    for (const num of numbers) {
      const deviceId = this.#pickLeastLoaded();
      if (!deviceId) break;
      buckets.get(deviceId).push(num);
      const w = this.#workloadMap.get(deviceId);
      w.assigned += 1;
    }

    return buckets;
  }

  getWorkloadMap() {
    return Object.fromEntries(this.#workloadMap);
  }
}

export const loadBalancer = new LoadBalancer();
