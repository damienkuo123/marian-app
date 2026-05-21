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
    adminSaveTasks: "/admin-save-tasks"
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
