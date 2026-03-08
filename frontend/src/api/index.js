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

export const completeAction = (threatId, clientId, actionIndex, actionStep) =>
  client.post(`/threats/${threatId}/complete`, {
    client_id: clientId,
    action_index: actionIndex,
    action_step: actionStep,
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

export const submitScore = (clientId, answers) =>
  client.post('/score', { client_id: clientId, answers }).then(r => r.data)

// Returns { latest: { total, digital_hygiene, local_awareness, rating }, history, count }
// or 404 if no scores yet
export const getScore = (clientId) =>
  client.get(`/score/${clientId}`).then(r => r.data)

export const getScoreRecommendations = (clientId, location) =>
  client.get(`/score/${clientId}/recommendations`, { params: { location } }).then(r => r.data)
