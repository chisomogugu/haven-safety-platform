import client from './client'

export const getThreats = (params = {}) =>
  client.get('/threats', { params }).then(r => r.data)

export const getThreat = (id) =>
  client.get(`/threats/${id}`).then(r => r.data)

export const createThreat = (data) =>
  client.post('/threats', data).then(r => r.data)

export const updateThreat = (id, data) =>
  client.patch(`/threats/${id}`, data).then(r => r.data)

export const getThreatActions = (id, clientId) =>
  client.post(`/threats/${id}/actions`, { client_id: clientId }).then(r => r.data)

export const completeAction = (threatId, clientId, actionIndex, actionStep, points = 3) =>
  client.post(`/threats/${threatId}/complete`, {
    client_id: clientId,
    action_index: actionIndex,
    action_step: actionStep,
    points,
  }).then(r => r.data)

export const getProfile = (clientId) =>
  client.get(`/profile/${clientId}`).then(r => r.data)

export const saveProfile = (data) =>
  client.post('/profile', data).then(r => r.data)

export const detectIntent = (text, imageB64, clientId) =>
  client.post('/intent', { text, image: imageB64, client_id: clientId }).then(r => r.data)

export const analyzeScam = (text, imageB64, clientId) =>
  client.post('/analyze', { text, image: imageB64, client_id: clientId }).then(r => r.data)

export const getDigest = (clientId, location, interests) =>
  client.get('/digest', { params: { client_id: clientId, location, interests } }).then(r => r.data)

export const getDailyCheckins = (clientId, count = 4) =>
  client.get('/daily-checkins', { params: { client_id: clientId, count } }).then(r => r.data)
