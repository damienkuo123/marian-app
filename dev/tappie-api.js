// tappie-api.js - Tappie Supabase Dev API Layer
// 只要替換 YOUR_PROJECT_REF 即可。
const TappieAPI = {
  mode: "supabase-dev",
  supabaseBaseUrl: "https://diptahklguohjtjnwnbf.supabase.co/functions/v1",
  endpoints: {
    resolveStudent: "/resolve-student",
    getDashboard: "/get-dashboard",
    getAzureToken: "/get-azure-token",
    submitPractice: "/submit-practice",
    getDiagnosticReport: "/get-diagnostic-report",
    adminGetData: "/admin-get-data",
    adminSaveStudents: "/admin-save-students",
    adminSaveTasks: "/admin-save-tasks",
    getLobbyData: "/get-lobby-data",
    createBattleRoom: "/create-battle-room",
    joinBattleRoom: "/join-battle-room",
    getBattleStatus: "/get-battle-status",
    setArenaReady: "/set-arena-ready",
    submitBattleScore: "/submit-battle-score",
    cancelBattleRoom: "/cancel-battle-room",
    getAvatarShop: "/get-avatar-shop",
    equipAvatar: "/equip-avatar",
    claimGacha: "/claim-gacha",
  },
  async _get(path) {
    const res = await fetch(this.supabaseBaseUrl + path);
    return await res.json();
  },
  async _post(path, body) {
    const res = await fetch(this.supabaseBaseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  },
  async resolveStudentByUid(uid) {
    return await this._get(`${this.endpoints.resolveStudent}?uid=${encodeURIComponent(uid)}`);
  },
  async resolveStudentByCard(cardId) {
    return await this._get(`${this.endpoints.resolveStudent}?cardId=${encodeURIComponent(cardId)}`);
  },
  async getDashboard(uid) {
    return await this._get(`${this.endpoints.getDashboard}?uid=${encodeURIComponent(uid)}`);
  },
  async getAzureToken() {
    return await this._get(this.endpoints.getAzureToken);
  },
  async submitPractice(payload) {
    return await this._post(this.endpoints.submitPractice, payload);
  },
  async getDiagnosticReport(uid, filter = "unit") {
    return await this._get(`${this.endpoints.getDiagnosticReport}?uid=${encodeURIComponent(uid)}&filter=${encodeURIComponent(filter)}`);
  },
  async adminGetData(schoolCode = "TEST01", mode = "all") {
    return await this._get(`${this.endpoints.adminGetData}?schoolCode=${encodeURIComponent(schoolCode)}&mode=${encodeURIComponent(mode)}`);
  },
  async adminSaveStudents(payload) {
    return await this._post(this.endpoints.adminSaveStudents, payload);
  },
  async adminSaveTasks(payload) {
    return await this._post(this.endpoints.adminSaveTasks, payload);
  },

  async getLobbyData(uid, classCode = "") {
    const qs = new URLSearchParams({ uid });
    if (classCode) qs.set("classCode", classCode);
    return await this._get(`${this.endpoints.getLobbyData}?${qs.toString()}`);
  },
  async createBattleRoom(payload) {
    return await this._post(this.endpoints.createBattleRoom, payload);
  },
  async joinBattleRoom(payload) {
    return await this._post(this.endpoints.joinBattleRoom, payload);
  },
  async getBattleStatus(uid, { roomCode = "", roomId = "" } = {}) {
    const qs = new URLSearchParams({ uid });
    if (roomCode) qs.set("roomCode", roomCode);
    if (roomId) qs.set("roomId", roomId);
    return await this._get(`${this.endpoints.getBattleStatus}?${qs.toString()}`);
  },
  async setArenaReady(payload) {
    return await this._post(this.endpoints.setArenaReady, payload);
  },
  async submitBattleScore(payload) {
    return await this._post(this.endpoints.submitBattleScore, payload);
  },
  async cancelBattleRoom(payload) {
    return await this._post(this.endpoints.cancelBattleRoom, payload);
  },
  async getAvatarShop(uid) {
    return await this._get(`${this.endpoints.getAvatarShop}?uid=${encodeURIComponent(uid)}`);
  },
  async equipAvatar(payload) {
    return await this._post(this.endpoints.equipAvatar, payload);
  },
  async claimGacha(payload = {}) {
    // claim-gacha v3 支援 GET；用 GET 避免 Supabase Test POST / iOS POST 快取問題。
    const qs = new URLSearchParams();
    if (payload.uid) qs.set("uid", payload.uid);
    if (payload.free !== undefined) qs.set("free", String(!!payload.free));
    if (payload.source) qs.set("source", payload.source);
    if (payload.costPoints !== undefined) qs.set("costPoints", String(payload.costPoints));
    if (payload.unlockPhrase) qs.set("unlockPhrase", payload.unlockPhrase);
    if (payload.unlockScore !== undefined && payload.unlockScore !== null) qs.set("unlockScore", String(payload.unlockScore));
    if (payload.roomCode) qs.set("roomCode", payload.roomCode);
    if (payload.legacyAddPoints !== undefined) qs.set("legacyAddPoints", String(payload.legacyAddPoints));
    if (Array.isArray(payload.legacyAvatars) && payload.legacyAvatars.length) qs.set("legacyAvatars", payload.legacyAvatars.join(","));
    return await this._get(`${this.endpoints.claimGacha}?${qs.toString()}`);
  },
  toLegacyDashboard(data) {
    if (!data || !data.success) return data || { success: false };
    return {
      success: true,
      studentName: data.student?.name || "-",
      currentPoints: data.student?.points || 0,
      studentType: data.student?.studentType || "normal",
      classId: data.student?.classCode || "",
      currentUnit: data.currentUnit?.unitName || "-",
      endDate: data.currentUnit?.endDate || "-",
      homework: data.recentAttempts?.[0] || null,
      words: data.words || [],
      leaderboard: data.leaderboard || [],
      recentLogs: [],
      email: data.student?.parentEmail || "",
      raw: data
    };
  }
};
window.TappieAPI = TappieAPI;
