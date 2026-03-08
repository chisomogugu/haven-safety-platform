import axios from 'axios'

const client = axios.create({
  baseURL: 'http://127.0.0.1:5000/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.response.use(
  res => res,
  err => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      (err.code === 'ECONNABORTED' ? 'Request timed out. Please try again.' : null) ||
      (err.message === 'Network Error' ? 'Unable to connect. Check your internet connection.' : null) ||
      'Something went wrong. Please try again.'
    return Promise.reject({ message, status: err.response?.status, details: err.response?.data?.details })
  }
)

export default client
