/**
 * Staff API — owns staff CRUD transport.
 * WHY: single contract owner for staff admin so query invalidation stays aligned. Contract: GET /staff, GET /staff/:id, POST /staff, PATCH /staff/:id, PATCH /staff/:id/toggle-active, POST /staff/:id/reset-password, DELETE /staff/:id, GET /staff/summary; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

/**
 * Staff API Functions
 *
 * All functions return res.data (the { success, message, data } envelope).
 */

export function getStaffListRequest(params = {}) {
  return api.get("/staff", { params }).then((res) => res.data);
}

export function getStaffRequest(id) {
  return api.get(`/staff/${id}`).then((res) => res.data);
}

export function createStaffRequest(data) {
  return api.post("/staff", data).then((res) => res.data);
}

export function updateStaffRequest(id, data) {
  return api.patch(`/staff/${id}`, data).then((res) => res.data);
}

export function toggleActiveStaffRequest(id) {
  return api.patch(`/staff/${id}/toggle-active`).then((res) => res.data);
}

export function resetPasswordStaffRequest(id, data) {
  return api.post(`/staff/${id}/reset-password`, data).then((res) => res.data);
}

export function deleteStaffRequest(id) {
  return api.delete(`/staff/${id}`).then((res) => res.data);
}

export function getStaffSummaryRequest() {
  return api.get("/staff/summary").then((res) => res.data);
}
