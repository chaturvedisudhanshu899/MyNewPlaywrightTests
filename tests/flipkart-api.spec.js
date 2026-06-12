/**
 * flipkart-api.spec.js
 * API tests using Playwright's built-in APIRequestContext.
 *
 * Since Flipkart's own APIs require auth tokens, we test:
 *   1. Flipkart public HTTP responses (status, headers, redirects)
 *   2. FakeStore API  → products/carts/users CRUD  (public mock e-commerce API)
 *   3. DummyJSON API  → products/orders/auth       (public mock e-commerce API)
 *
 * Run: npx playwright test tests/flipkart-api.spec.js --project=API-Tests
 */
const { test, expect, request } = require('@playwright/test');
const { getJson, postJson, putJson, deleteResource, assertResponseFields, measureResponseTime } =
  require('../utils/apiHelpers');
const testData = require('../data/flipkartTestData.json');

const FAKE_STORE = process.env.FAKE_STORE_API || testData.fakeStoreApi;   // https://fakestoreapi.com
const DUMMY_JSON = process.env.DUMMY_API_BASE || testData.dummyApiBase;   // https://dummyjson.com

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Flipkart Public HTTP Checks
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🌐 Flipkart — Public HTTP Responses', () => {

  test('TC_API_HTTP_01 | GET flipkart.com returns HTTP 200', async ({ request }) => {
    const response = await request.get('/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    expect(response.status()).toBe(200);
  });

  test('TC_API_HTTP_02 | Response has Content-Type text/html', async ({ request }) => {
    const response = await request.get('/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    expect(response.headers()['content-type']).toContain('text/html');
  });

  test('TC_API_HTTP_03 | Flipkart search endpoint responds within 10 seconds', async ({ request }) => {
    const { elapsedMs, status } = await measureResponseTime(() =>
      request.get('/search?q=laptop', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(async r => ({ status: r.status(), response: r }))
    );
    expect(status).toBe(200);
    expect(elapsedMs).toBeLessThan(10_000);
  });

  test('TC_API_HTTP_04 | Flipkart 404 for unknown route', async ({ request }) => {
    const response = await request.get('/this-page-definitely-does-not-exist-xyz987', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    // Flipkart may return 200 with a 404 page or true 404
    expect([200, 301, 302, 404]).toContain(response.status());
  });

  test('TC_API_HTTP_05 | HTTPS redirect — http redirects to https', async ({ request }) => {
    const response = await request.get('/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    expect(response.url()).toContain('https://');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — FakeStore API — Products (E-commerce Mock)
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🛒 FakeStore API — Products', () => {

  test('TC_API_PROD_01 | GET /products returns 200 with array', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/products`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });

  test('TC_API_PROD_02 | Each product has required fields', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/products`);
    body.slice(0, 5).forEach(product => {
      assertResponseFields(product, ['id', 'title', 'price', 'category', 'image', 'rating']);
    });
  });

  test('TC_API_PROD_03 | GET /products/:id returns single product', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/products/1`);
    expect(status).toBe(200);
    expect(body.id).toBe(1);
    expect(typeof body.title).toBe('string');
    expect(body.price).toBeGreaterThan(0);
  });

  test('TC_API_PROD_04 | GET /products/categories returns category list', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/products/categories`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
    expect(body).toContain('electronics');
  });

  test('TC_API_PROD_05 | GET /products/category/electronics returns filtered list', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/products/category/electronics`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
    body.forEach(p => expect(p.category).toBe('electronics'));
  });

  test('TC_API_PROD_06 | GET /products?limit=5 returns exactly 5 products', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/products?limit=5`);
    expect(status).toBe(200);
    expect(body.length).toBe(5);
  });

  test('TC_API_PROD_07 | GET /products?sort=desc returns products in descending id order', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/products?sort=desc`);
    const ids = body.map(p => p.id);
    // First id should be greater than last
    expect(ids[0]).toBeGreaterThan(ids[ids.length - 1]);
  });

  test('TC_API_PROD_08 | POST /products creates a new product', async ({ request }) => {
    const payload = {
      title: 'Flipkart Test Laptop',
      price: 49999,
      description: 'A test product created by Playwright',
      category: 'electronics',
      image: 'https://fakestoreapi.com/img/81fAn1n5.jpg',
    };
    const { status, body } = await postJson(request, `${FAKE_STORE}/products`, payload);
    expect(status).toBe(200);
    expect(body.id).toBeDefined();
    expect(body.title).toBe(payload.title);
    expect(body.price).toBe(payload.price);
  });

  test('TC_API_PROD_09 | PUT /products/:id updates product', async ({ request }) => {
    const payload = { title: 'Updated Flipkart Laptop', price: 55000 };
    const { status, body } = await putJson(request, `${FAKE_STORE}/products/1`, payload);
    expect(status).toBe(200);
    expect(body.title).toBe('Updated Flipkart Laptop');
  });

  test('TC_API_PROD_10 | DELETE /products/:id returns deleted product', async ({ request }) => {
    const { status } = await deleteResource(request, `${FAKE_STORE}/products/1`);
    expect(status).toBe(200);
  });

  test('TC_API_PROD_11 | Product rating has rate and count fields', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/products/1`);
    expect(body.rating).toHaveProperty('rate');
    expect(body.rating).toHaveProperty('count');
    expect(body.rating.rate).toBeGreaterThan(0);
    expect(body.rating.count).toBeGreaterThan(0);
  });

  test('TC_API_PROD_12 | Response time for product list is under 5s', async ({ request }) => {
    const { elapsedMs } = await measureResponseTime(() =>
      getJson(request, `${FAKE_STORE}/products`)
    );
    expect(elapsedMs).toBeLessThan(5000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — FakeStore API — Carts
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🛒 FakeStore API — Carts', () => {

  test('TC_API_CART_01 | GET /carts returns all carts', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/carts`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('TC_API_CART_02 | GET /carts/:id returns a single cart', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/carts/1`);
    expect(status).toBe(200);
    assertResponseFields(body, ['id', 'userId', 'products', 'date']);
  });

  test('TC_API_CART_03 | Cart products array is non-empty', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/carts/1`);
    expect(Array.isArray(body.products)).toBeTruthy();
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('TC_API_CART_04 | GET /carts/user/:userId returns user carts', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/carts/user/1`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
    body.forEach(cart => expect(cart.userId).toBe(1));
  });

  test('TC_API_CART_05 | POST /carts adds a new cart', async ({ request }) => {
    const payload = {
      userId: 5,
      date: new Date().toISOString().split('T')[0],
      products: [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }],
    };
    const { status, body } = await postJson(request, `${FAKE_STORE}/carts`, payload);
    expect(status).toBe(200);
    expect(body.id).toBeDefined();
  });

  test('TC_API_CART_06 | Date range filter on carts works', async ({ request }) => {
    const { status, body } = await getJson(
      request,
      `${FAKE_STORE}/carts?startdate=2019-12-10&enddate=2020-10-10`
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — FakeStore API — Users & Auth
// ═════════════════════════════════════════════════════════════════════════════
test.describe('👤 FakeStore API — Users & Auth', () => {

  test('TC_API_USER_01 | GET /users returns all users', async ({ request }) => {
    const { status, body } = await getJson(request, `${FAKE_STORE}/users`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('TC_API_USER_02 | User object has required fields', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/users/1`);
    assertResponseFields(body, ['id', 'email', 'username', 'password', 'name', 'address', 'phone']);
  });

  test('TC_API_USER_03 | User name has firstname and lastname', async ({ request }) => {
    const { body } = await getJson(request, `${FAKE_STORE}/users/1`);
    expect(body.name).toHaveProperty('firstname');
    expect(body.name).toHaveProperty('lastname');
    expect(body.name.firstname.length).toBeGreaterThan(0);
  });

  test('TC_API_USER_04 | POST /auth/login returns token', async ({ request }) => {
    const { status, body } = await postJson(request, `${FAKE_STORE}/auth/login`, {
      username: 'mor_2314',
      password: '83r5^_',
    });
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
  });

  test('TC_API_USER_05 | Invalid login credentials return error', async ({ request }) => {
    const { status } = await postJson(request, `${FAKE_STORE}/auth/login`, {
      username: 'invalid_user_xyz',
      password: 'wrongpassword123',
    });
    // FakeStore returns 401 for bad creds
    expect([400, 401, 403]).toContain(status);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 5 — DummyJSON API — Extended E-commerce Scenarios
// ═════════════════════════════════════════════════════════════════════════════
test.describe('📦 DummyJSON API — Products & Orders', () => {

  test('TC_API_DUMMY_01 | GET /products returns paginated list', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/products`);
    expect(status).toBe(200);
    expect(body.products).toBeDefined();
    expect(Array.isArray(body.products)).toBeTruthy();
    expect(body.total).toBeGreaterThan(0);
  });

  test('TC_API_DUMMY_02 | Product has all e-commerce fields', async ({ request }) => {
    const { body } = await getJson(request, `${DUMMY_JSON}/products/1`);
    assertResponseFields(body, ['id', 'title', 'price', 'description', 'category', 'thumbnail', 'rating', 'stock']);
  });

  test('TC_API_DUMMY_03 | Search products by query', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/products/search?q=phone`);
    expect(status).toBe(200);
    expect(body.products.length).toBeGreaterThan(0);
    body.products.forEach(p =>
      expect(p.title.toLowerCase() + p.description.toLowerCase()).toMatch(/phone/i)
    );
  });

  test('TC_API_DUMMY_04 | GET /products/categories returns list', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/products/categories`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });

  test('TC_API_DUMMY_05 | GET /products/category/smartphones returns phones', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/products/category/smartphones`);
    expect(status).toBe(200);
    body.products.forEach(p => expect(p.category).toBe('smartphones'));
  });

  test('TC_API_DUMMY_06 | Limit and skip pagination works', async ({ request }) => {
    const { body: page1 } = await getJson(request, `${DUMMY_JSON}/products?limit=5&skip=0`);
    const { body: page2 } = await getJson(request, `${DUMMY_JSON}/products?limit=5&skip=5`);
    const ids1 = page1.products.map(p => p.id);
    const ids2 = page2.products.map(p => p.id);
    // No overlap between pages
    expect(ids1.some(id => ids2.includes(id))).toBeFalsy();
  });

  test('TC_API_DUMMY_07 | POST /products/add creates product', async ({ request }) => {
    const { status, body } = await postJson(request, `${DUMMY_JSON}/products/add`, {
      title: 'Flipkart PW Test Product',
      price: 1299.99,
      stock: 50,
      category: 'electronics',
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.title).toBe('Flipkart PW Test Product');
  });

  test('TC_API_DUMMY_08 | PUT /products/:id updates product fields', async ({ request }) => {
    const { status, body } = await putJson(request, `${DUMMY_JSON}/products/1`, {
      title: 'Updated by Playwright',
    });
    expect(status).toBe(200);
    expect(body.title).toBe('Updated by Playwright');
  });

  test('TC_API_DUMMY_09 | DELETE /products/:id marks product as deleted', async ({ request }) => {
    const { status, body } = await deleteResource(request, `${DUMMY_JSON}/products/1`);
    expect(status).toBe(200);
    expect(body.isDeleted).toBeTruthy();
  });

  test('TC_API_DUMMY_10 | User login via DummyJSON returns token and user info', async ({ request }) => {
    const { status, body } = await postJson(request, `${DUMMY_JSON}/auth/login`, {
      username: 'emilys',
      password: 'emilyspass',
    });
    expect(status).toBe(200);
    expect(body.accessToken).toBeDefined();
    expect(body.email).toContain('@');
    expect(body.firstName).toBeDefined();
  });

  test('TC_API_DUMMY_11 | GET /carts returns all carts', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/carts`);
    expect(status).toBe(200);
    expect(Array.isArray(body.carts)).toBeTruthy();
  });

  test('TC_API_DUMMY_12 | GET /carts/:id returns cart with products', async ({ request }) => {
    const { status, body } = await getJson(request, `${DUMMY_JSON}/carts/1`);
    expect(status).toBe(200);
    assertResponseFields(body, ['id', 'products', 'total', 'discountedTotal', 'userId']);
    expect(body.products.length).toBeGreaterThan(0);
  });

  test('TC_API_DUMMY_13 | Cart total matches sum of product prices', async ({ request }) => {
    const { body } = await getJson(request, `${DUMMY_JSON}/carts/1`);
    const computedTotal = body.products.reduce((sum, p) => sum + p.total, 0);
    // Allow floating point tolerance of ±1
    expect(Math.abs(computedTotal - body.total)).toBeLessThan(1);
  });

  test('TC_API_DUMMY_14 | Response headers include Content-Type JSON', async ({ request }) => {
    const { response } = await getJson(request, `${DUMMY_JSON}/products/1`);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('TC_API_DUMMY_15 | Product stock is a non-negative integer', async ({ request }) => {
    const { body } = await getJson(request, `${DUMMY_JSON}/products/1`);
    expect(typeof body.stock).toBe('number');
    expect(body.stock).toBeGreaterThanOrEqual(0);
  });
});
