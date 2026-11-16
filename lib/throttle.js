// Limits how often something can happen for one key, like sign-in emails to one address.
// Kept in memory: a restart clears it, which is fine for limits measured in minutes and hours.
const DAY_MS = 24 * 60 * 60 * 1000;

class Throttle {
    // min_gap_ms: time between tries. per_day: tries in any 24 hours. 0 or null turns either off.
    constructor({min_gap_ms = 0, per_day = 0} = {}) {
        this.min_gap_ms = min_gap_ms || 0;
        this.per_day = per_day || 0;
        this.history = new Map();
    }

    // Records a try and returns true if it's allowed, false if it's over a limit
    attempt(key, now_ms = Date.now()) {
        const recent = (this.history.get(key) ?? []).filter(ms => now_ms - ms < DAY_MS);
        const last = recent.at(-1);
        if((this.min_gap_ms && last !== undefined && now_ms - last < this.min_gap_ms)
            || (this.per_day && recent.length >= this.per_day)) {
            this.history.set(key, recent);
            return false;
        }
        recent.push(now_ms);
        this.history.set(key, recent);
        // Keep memory in check: forget keys with nothing in the last day
        if(this.history.size > 10000) {
            for(const [k, times] of this.history) {
                if(times.every(ms => now_ms - ms >= DAY_MS)) {
                    this.history.delete(k);
                }
            }
        }
        return true;
    }
}

module.exports = Throttle;
