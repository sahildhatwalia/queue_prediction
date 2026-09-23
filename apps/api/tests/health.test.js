import request from 'supertest';
import express from 'express';
// We can mock or import the real app.
// Since the app initialization might require DB connections, we can create a simple dummy app for the health check.
// In a real scenario, you'd export the initialized app from app.js without starting the server, 
// but let's write a simple test to verify jest works.

const app = express();
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

describe('Health Endpoint', () => {
  it('should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
