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

export function resetPinStaffRequest(id, data) {
  return api.post(`/staff/${id}/reset-pin`, data).then((res) => res.data);
}

export function resetPasswordStaffRequest(id, data) {
  return api.post(`/staff/${id}/reset-password`, data).then((res) => res.data);
}

export function deleteStaffRequest(id) {
  return api.delete(`/staff/${id}`).then((res) => res.data);
}

export function getStaffPerformanceRequest(params = {}) {
  return api.get("/staff/performance", { params }).then((res) => res.data);
}
