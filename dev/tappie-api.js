// tappie-api.js - Tappie Supabase Dev API Layer
// Micro Polish v3 - unit_id first learning progress + safe weekly report
const TappieAPI = {
  mode: "supabase-dev",
  supabaseBaseUrl: "https://diptahklguohjtjnwnbf.supabase.co/functions/v1",
  endpoints: {
    resolveStudent: "/resolve-student",
    getDashboard: "/get-dashboard",
    getPracticeUnits: "/get-practice-units",
    getPracticeData: "/get-practice-data",
    getAzureToken: "/get-azure-token",
    submitPractice: "/submit-practice",
    claimPracticeChallenge: "/claim-practice-challenge",
    getDiagnosticReport: "/get-diagnostic-report",
    adminGetData: "/admin-get-data",
    adminGetProgress: "/admin-get-progress",
    adminSaveStudents: "/admin-save-students",
    adminSaveTasks: "/admin-save-tasks",
    getLobbyData: "/get-lobby-data",
    createBattleRoom: "/create-battle-room",
    joinBattleRoom: "/join-battle-room",
    getBattleStatus: "/get-battle-status",
    setArenaReady: "/set-arena-ready",
    submitBattleScore: "/submit-battle-score",
    cancelBattleRoom: "/cancel-battle-room",
    createAiBattleRoom: "/create-ai-battle-room",
    submitAiBattleScore: "/submit-ai-battle-score",
    getCurrentEvent: "/get-current-event",
    finishBattleRoom: "/finish-battle-room",
    resolveBattleTimeout: "/resolve-battle-timeout",
    getAvatarShop: "/get-avatar-shop",
    equipAvatar: "/equip-avatar",
    claimGacha: "/claim-gacha",
    purchaseAvatar: "/purchase-avatar",
    getStudentActivity: "/get-student-activity",
    updateWeeklyReport: "/update-weekly-report",
    adminGetBranding: "/admin-get-branding",
    adminUploadBrandingAsset: "/admin-upload-branding-asset",
    adminDeleteBrandingAsset: "/admin-delete-branding-asset",
    adminNewsletters: "/admin-newsletters"
  },
  async _get(path) {
    const res = await fetch(this.supabaseBaseUrl + path);
    return await res.json();
  },
  async _post(path, body, options = {}) {
    const res = await fetch(this.supabaseBaseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal
    });
    return await res.json();
  },
  async resolveStudentByUid(uid) { return await this._get(`${this.endpoints.resolveStudent}?uid=${encodeURIComponent(uid)}`); },
  async resolveStudentByCard(cardId) { return await this._get(`${this.endpoints.resolveStudent}?cardId=${encodeURIComponent(cardId)}`); },
  async getPracticeUnits(uid) { return await this._get(`${this.endpoints.getPracticeUnits}?uid=${encodeURIComponent(uid)}`); },
  async getPracticeData({ uid, mode = "challenge", unitName = "", unitId = "" } = {}) {
    const qs = new URLSearchParams({ uid, mode });
    if (unitName) qs.set("unitName", unitName);
    if (unitId) qs.set("unitId", unitId);
    return await this._get(`${this.endpoints.getPracticeData}?${qs.toString()}`);
  },
  async getDashboard(uid) {
    const base = await this._get(`${this.endpoints.getDashboard}?uid=${encodeURIComponent(uid)}`);

    try {
      const practice = await this.getPracticeUnits(uid);
      if (practice && practice.success) {
        base.student = { ...(base.student || {}), ...(practice.student || {}) };
        base.usage = { ...(base.usage || {}), ...(practice.usage || {}) };
        base.currentUnit = practice.currentUnit || null;
        base.reviewUnits = practice.reviewUnits || [];
        base.missionCount = practice.missionCount ?? base.missionCount;
        base.practice = practice;
      }
    } catch (err) {
      console.warn("getPracticeUnits merge failed", err);
    }

    try {
      const activity = await this.getStudentActivity(uid);
      if (activity && activity.success) {
        base.recentLogs = activity.items || [];
        base.activity = activity;
      }
    } catch (err) {
      console.warn("getStudentActivity merge failed", err);
    }

    return base;
  },
  async getAzureToken() { return await this._get(this.endpoints.getAzureToken); },
  async submitPractice(payload, options = {}) { return await this._post(this.endpoints.submitPractice, payload, options); },
  async claimPracticeChallenge(payload = {}) {
    // Normalize unit identifiers so the backend can resolve by stable unit_id first.
    // Keep legacy names for older pages that still send unitName/currentUnit.
    const normalized = {
      ...payload,
      uid: payload.uid || payload.studentUid || payload.student_id || payload.id || "",
      unitId: payload.unitId || payload.unit_id || payload.currentUnitId || payload.current_unit_id || "",
      unitName: payload.unitName || payload.unit_name || payload.currentUnit || payload.current_unit || payload.unit || "",
      averageScore: payload.averageScore ?? payload.average_score ?? payload.avg ?? payload.score ?? 0,
      details: payload.details ?? payload.detail_json ?? payload.detailJson ?? [],
    };

    // Also provide snake_case aliases for Edge Functions that read either format.
    if (normalized.unitId && !normalized.unit_id) normalized.unit_id = normalized.unitId;
    if (normalized.unitName && !normalized.unit_name) normalized.unit_name = normalized.unitName;
    if (normalized.averageScore !== undefined && normalized.average_score === undefined) {
      normalized.average_score = normalized.averageScore;
    }

    return await this._post(this.endpoints.claimPracticeChallenge, normalized);
  },
  async getDiagnosticReport(uid, filter = "unit", options = {}) {
    const qs = new URLSearchParams({
      uid: String(uid || ""),
      filter: String(filter || "unit")
    });

    const unitId = options.unitId || options.unit_id || "";
    const unitName = options.unitName || options.unit_name || "";
    const startDate = options.startDate || options.start_date || "";
    const endDate = options.endDate || options.end_date || "";

    if (unitId) qs.set("unitId", unitId);
    if (unitName) qs.set("unitName", unitName);
    if (startDate) qs.set("startDate", startDate);
    if (endDate) qs.set("endDate", endDate);

    return await this._get(`${this.endpoints.getDiagnosticReport}?${qs.toString()}`);
  },
  async adminGetData(schoolCode = "TEST01", mode = "all") { return await this._get(`${this.endpoints.adminGetData}?schoolCode=${encodeURIComponent(schoolCode)}&mode=${encodeURIComponent(mode)}`); },
  async adminGetProgress(schoolCode = "TEST01") { return await this._get(`${this.endpoints.adminGetProgress}?schoolCode=${encodeURIComponent(schoolCode)}`); },
  async adminSaveStudents(payload) { return await this._post(this.endpoints.adminSaveStudents, payload); },
  async adminSaveTasks(payload) { return await this._post(this.endpoints.adminSaveTasks, payload); },
  async getLobbyData(uid, classCode = "") { const qs = new URLSearchParams({ uid }); if (classCode) qs.set("classCode", classCode); return await this._get(`${this.endpoints.getLobbyData}?${qs.toString()}`); },
  async createBattleRoom(payload) { return await this._post(this.endpoints.createBattleRoom, payload); },
  async joinBattleRoom(payload) { return await this._post(this.endpoints.joinBattleRoom, payload); },
  async getBattleStatus(uid, { roomCode = "", roomId = "" } = {}) { const qs = new URLSearchParams({ uid }); if (roomCode) qs.set("roomCode", roomCode); if (roomId) qs.set("roomId", roomId); return await this._get(`${this.endpoints.getBattleStatus}?${qs.toString()}`); },
  async setArenaReady(payload) { return await this._post(this.endpoints.setArenaReady, payload); },
  async submitBattleScore(payload) { return await this._post(this.endpoints.submitBattleScore, payload); },
  async cancelBattleRoom(payload) { return await this._post(this.endpoints.cancelBattleRoom, payload); },
  async createAiBattleRoom(payload) { return await this._post(this.endpoints.createAiBattleRoom, payload); },
  async submitAiBattleScore(payload) { return await this._post(this.endpoints.submitAiBattleScore, payload); },
  async getCurrentEvent(uid) { return await this._get(`${this.endpoints.getCurrentEvent}?uid=${encodeURIComponent(uid)}`); },
  async finishBattleRoom(payload = {}) { const qs = new URLSearchParams(); if (payload.uid) qs.set("uid", payload.uid); if (payload.roomCode) qs.set("roomCode", payload.roomCode); if (payload.roomId) qs.set("roomId", payload.roomId); if (payload.winnerRole) qs.set("winnerRole", payload.winnerRole); if (payload.reason) qs.set("reason", payload.reason); return await this._get(`${this.endpoints.finishBattleRoom}?${qs.toString()}`); },
  async resolveBattleTimeout(payload = {}) { const qs = new URLSearchParams(); if (payload.uid) qs.set("uid", payload.uid); if (payload.roomCode) qs.set("roomCode", payload.roomCode); if (payload.roomId) qs.set("roomId", payload.roomId); return await this._get(`${this.endpoints.resolveBattleTimeout}?${qs.toString()}`); },
  async getAvatarShop(uid) { return await this._get(`${this.endpoints.getAvatarShop}?uid=${encodeURIComponent(uid)}`); },
  async equipAvatar(payload) { return await this._post(this.endpoints.equipAvatar, payload); },
  async claimGacha(payload = {}) {
    const qs = new URLSearchParams();
    if (payload.uid) qs.set("uid", payload.uid);
    if (payload.source) qs.set("source", payload.source);
    if (payload.roomCode) qs.set("roomCode", payload.roomCode);
    const addPoints = payload.addPoints ?? payload.points ?? payload.legacyAddPoints ?? 0;
    qs.set("addPoints", String(addPoints));
    const avatars = payload.avatars || payload.avatarIds || payload.legacyAvatars || [];
    if (Array.isArray(avatars) && avatars.length) qs.set("avatars", avatars.join(","));
    if (typeof avatars === "string" && avatars.trim()) qs.set("avatars", avatars.trim());
    if (payload.unlockPhrase) qs.set("unlockPhrase", payload.unlockPhrase);
    if (payload.unlockScore !== undefined && payload.unlockScore !== null) qs.set("unlockScore", String(payload.unlockScore));
    if (payload.metadata) { try { qs.set("metadata", JSON.stringify(payload.metadata)); } catch (_) {} }
    return await this._get(`${this.endpoints.claimGacha}?${qs.toString()}`);
  },
  async purchaseAvatar(payload = {}) { return await this._post(this.endpoints.purchaseAvatar, payload); },
  async getStudentActivity(uid) { return await this._get(`${this.endpoints.getStudentActivity}?uid=${encodeURIComponent(uid)}`); },
  async updateWeeklyReport(payload = {}) { return await this._post(this.endpoints.updateWeeklyReport, payload); },
  async adminGetBranding(schoolCode = "TEST01") { return await this._get(`${this.endpoints.adminGetBranding}?schoolCode=${encodeURIComponent(schoolCode)}`); },
  async adminUploadBrandingAsset(payload = {}) { return await this._post(this.endpoints.adminUploadBrandingAsset, payload); },
  async adminDeleteBrandingAsset(payload = {}) { return await this._post(this.endpoints.adminDeleteBrandingAsset, payload); },
  async adminGetNewsletters(schoolCode = "TEST01") { return await this._get(`${this.endpoints.adminNewsletters}?schoolCode=${encodeURIComponent(schoolCode)}`); },
  async adminAddNewsletter(payload = {}) { return await this._post(this.endpoints.adminNewsletters, { ...payload, action: "add" }); },
  async adminUpdateNewsletter(payload = {}) { return await this._post(this.endpoints.adminNewsletters, { ...payload, action: "update" }); },
  async adminDeleteNewsletter(payload = {}) { return await this._post(this.endpoints.adminNewsletters, { ...payload, action: "delete" }); },
  async adminReorderNewsletters(payload = {}) { return await this._post(this.endpoints.adminNewsletters, { ...payload, action: "reorder" }); },

  toLegacyDashboard(data) {
    if (!data || !data.success) return data || { success: false };
    const student = data.student || {};
    const currentUnit = data.currentUnit || null;
    const currentCompletion = currentUnit?.completion || {};
    const bestScore = Number(currentCompletion.bestScore ?? currentCompletion.lastScore ?? 0);

    return {
      success: true,
      uid: student.uid,
      studentName: student.name || "Tappie 學生",
      currentPoints: Number(student.points || 0),
      studentType: student.studentType || student.student_type || "normal",
      classId: student.classCode || student.class_code || "",
      parentEmail: student.parentEmail || student.parent_email || "",
      currentUnit: currentUnit ? currentUnit.unitName : "未排定",
      currentUnitId: currentUnit ? currentUnit.unitId : "",
      endDate: currentUnit ? formatMonthDay(currentUnit.endDate) : "--/--",
      isCompleted: Boolean(currentCompletion.completedToday || bestScore > 0),
      lastScore: bestScore,
      awardedPoints: Number(currentCompletion.bestReward ?? currentCompletion.lastReward ?? 0),
      missionCount: Number(data.missionCount ?? currentCompletion.completionCount ?? 0),
      leaderboard: (data.leaderboard || []).map(item => ({ uid: item.uid, name: item.name, score: item.score })),
      reviewUnits: (data.reviewUnits || []).map(u => typeof u === 'string' ? u : ({
        unitId: u.unitId || u.id,
        unitName: u.unitName || u.unit_name || u.name || '',
        wordCount: u.wordCount || u.word_count || 0
      })).filter(u => typeof u === 'string' ? !!u : !!u.unitName),
      recentLogs: Array.isArray(data.recentLogs) ? data.recentLogs : [],
      gamification: data.gamification || defaultGamification(),
      usage: data.usage || {},
      logoUrl: data.logoUrl || "",
      iconUrl: data.iconUrl || "",
      raw: data
    };
  }
};
window.TappieAPI = TappieAPI;

function formatMonthDay(value) {
  if (!value) return "--/--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}

function defaultGamification() {
  return {
    dailyChallenge: { passScore: 60, tiers: [{min:80,pts:30},{min:70,pts:20},{min:60,pts:10}] },
    mission: { failThreshold:5, failBasePenalty:-250, failPenaltyStep:50, goodThreshold:10, goodReward:100, perfectThreshold:15, perfectReward:200 },
    leaderboard:[100,50,30],
    gachaPicks: { "初階Ai":1, "中階Ai":2, "高階Ai":3, "玩家對戰":3, "活動Boss":1 }
  };
}
