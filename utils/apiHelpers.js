/**
 * apiHelpers.js — Wrapper utilities for Playwright API request testing
 */

/**
 * Makes a GET request and returns the parsed JSON body + status
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} url
 * @param {Record<string,string>} [headers]
 */
async function getJson(request, url, headers = {}) {
  const response = await request.get(url, { headers });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body, response };
}

/**
 * Makes a POST request and returns the parsed JSON body + status
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} url
 * @param {object} payload
 * @param {Record<string,string>} [headers]
 */
async function postJson(request, url, payload, headers = {}) {
  const response = await request.post(url, {
    data: payload,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body, response };
}

/**
 * Makes a PUT request and returns the parsed JSON body + status
 */
async function putJson(request, url, payload, headers = {}) {
  const response = await request.put(url, {
    data: payload,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body, response };
}

/**
 * Makes a DELETE request and returns the status
 */
async function deleteResource(request, url, headers = {}) {
  const response = await request.delete(url, { headers });
  return { status: response.status(), response };
}

/**
 * Asserts common API response shape — status + required fields
 * @param {object} body
 * @param {string[]} requiredFields
 */
function assertResponseFields(body, requiredFields) {
  if (!body) throw new Error('Response body is null or not JSON');
  for (const field of requiredFields) {
    if (!(field in body)) {
      throw new Error(`Missing expected field "${field}" in response: ${JSON.stringify(body)}`);
    }
  }
}

/**
 * Returns the response time for a request in ms (Playwright doesn't expose this directly,
 * so we measure it ourselves)
 */
async function measureResponseTime(fn) {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  return { ...result, elapsedMs: elapsed };
}

module.exports = { getJson, postJson, putJson, deleteResource, assertResponseFields, measureResponseTime };
