import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { Hono } from 'hono';
import { jsxRenderer } from 'hono/jsx-renderer';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/logger';
import { corsMiddleware } from './middleware/cors';
// Import routes
import { auth } from './routes/auth';
import { equipment } from './routes/equipment';
import { equipmentSubmissions } from './routes/equipment-submissions';
import { players } from './routes/players';
import { search } from './routes/search';
import { health } from './routes/health';
import { createReviewsRoutes } from './routes/reviews';
import { moderation } from './routes/moderation';
import { discord } from './routes/discord';
// Import page components
import { HomePage } from './components/pages/HomePage';
import { EquipmentPage } from './components/pages/EquipmentPage';
import { PlayerPage } from './components/pages/PlayerPage';
import { PlayersListPage } from './components/pages/PlayersListPage';
import { PlayerSubmitPage } from './components/pages/PlayerSubmitPage';
import { PlayerEditPage } from './components/pages/PlayerEditPage';
import { SearchPage } from './components/pages/SearchPage';
import { LoginPage } from './components/pages/LoginPage';
import { AdminPage } from './components/pages/AdminPage';
import { AdminReviewsPage } from './components/pages/AdminReviewsPage';
import { AdminPlayerEditsPage } from './components/pages/AdminPlayerEditsPage';
import { AdminEquipmentSubmissionsPage } from './components/pages/AdminEquipmentSubmissionsPage';
import { ProfilePage } from './components/pages/ProfilePage';
import { EquipmentIndexPage } from './components/pages/EquipmentIndexPage';
import { EquipmentSubmitPage } from './components/pages/EquipmentSubmitPage';
import { NotFoundError } from './utils/errors';
import { InternalApiService } from './services/internal-api.service';
export function createApp() {
    const app = new Hono();
    // Global middleware
    app.use('*', corsMiddleware);
    app.use('*', requestLogger);
    app.use('*', errorHandler);
    // JSX renderer setup
    app.use('*', jsxRenderer());
    // API routes
    app.route('/api', health);
    app.route('/api/auth', auth);
    app.route('/api/equipment', equipment);
    app.route('/api/equipment-submissions', equipmentSubmissions);
    app.route('/api/players', players);
    app.route('/api/search', search);
    app.route('/api/reviews', createReviewsRoutes());
    app.route('/api/admin', moderation);
    app.route('/api/discord', discord);
    // Static file serving for client assets
    app.get('/client/auth.js', c => {
        c.header('Content-Type', 'application/javascript');
        return c.text(`
      // Authentication utilities for client-side usage
      // This file provides consistent authentication patterns across components
      console.log('Auth module loaded');
      
      // Global authentication functions will be added here in future
      window.authLoaded = true;
    `);
    });
    app.get('/client/forms.js', c => {
        c.header('Content-Type', 'application/javascript');
        return c.text(`
      // Form handling utilities for client-side usage
      // This file provides consistent form submission patterns
      console.log('Forms module loaded');
      
      // Global form handling functions will be added here in future
      window.formsLoaded = true;
    `);
    });
    // Frontend routes with JSX rendering
    app.get('/', async (c) => {
        // TODO: Fetch featured equipment and popular players
        const featuredEquipment = [];
        const popularPlayers = [];
        return c.render(_jsx(HomePage, { featuredEquipment: featuredEquipment, popularPlayers: popularPlayers }));
    });
    // Equipment submission page (must come before /:slug pattern)
    app.get('/equipment/submit', c => {
        const baseUrl = new globalThis.URL(c.req.url).origin;
        return c.render(_jsx(EquipmentSubmitPage, { baseUrl: baseUrl }));
    });
    app.get('/equipment/:slug', async (c) => {
        const slug = c.req.param('slug');
        try {
            const apiService = new InternalApiService(c);
            const equipment = await apiService.getEquipment(slug);
            if (!equipment) {
                throw new NotFoundError('Equipment not found');
            }
            const reviews = await apiService.getEquipmentReviews(equipment.id);
            // TODO: Fetch players who use this equipment
            const usedByPlayers = [];
            const similarEquipment = [];
            return c.render(_jsx(EquipmentPage, { equipment: equipment, reviews: reviews, usedByPlayers: usedByPlayers, similarEquipment: similarEquipment }));
        }
        catch (error) {
            if (error instanceof NotFoundError) {
                c.status(404);
                return c.render(_jsxs("div", { children: [_jsx("h1", { children: "Equipment Not Found" }), _jsx("p", { children: "The equipment you're looking for doesn't exist." })] }));
            }
            throw error;
        }
    });
    // Player submission and edit routes (must come before /:slug to avoid conflicts)
    app.get('/players/submit', c => {
        return c.render(_jsx(PlayerSubmitPage, {}));
    });
    app.get('/players/:slug/edit', async (c) => {
        const slug = c.req.param('slug');
        try {
            const apiService = new InternalApiService(c);
            const player = await apiService.getPlayer(slug);
            if (!player) {
                throw new NotFoundError('Player not found');
            }
            return c.render(_jsx(PlayerEditPage, { player: player }));
        }
        catch (error) {
            if (error instanceof NotFoundError) {
                c.status(404);
                return c.render(_jsxs("div", { children: [_jsx("h1", { children: "Player Not Found" }), _jsx("p", { children: "The player you're looking for doesn't exist." })] }));
            }
            throw error;
        }
    });
    app.get('/players/:slug', async (c) => {
        const slug = c.req.param('slug');
        try {
            const apiService = new InternalApiService(c);
            const player = await apiService.getPlayer(slug);
            if (!player) {
                throw new NotFoundError('Player not found');
            }
            const equipmentSetups = await apiService.getPlayerEquipmentSetups(player.id);
            // TODO: Fetch videos and career stats
            const videos = [];
            const careerStats = undefined;
            return c.render(_jsx(PlayerPage, { player: player, equipmentSetups: equipmentSetups, videos: videos, careerStats: careerStats }));
        }
        catch (error) {
            if (error instanceof NotFoundError) {
                c.status(404);
                return c.render(_jsxs("div", { children: [_jsx("h1", { children: "Player Not Found" }), _jsx("p", { children: "The player you're looking for doesn't exist." })] }));
            }
            throw error;
        }
    });
    app.get('/search', async (c) => {
        const query = c.req.query('q') || '';
        let results = undefined;
        if (query) {
            try {
                const apiService = new InternalApiService(c);
                const [equipment, players] = await Promise.all([
                    apiService.searchEquipment(query),
                    apiService.searchPlayers(query),
                ]);
                results = { equipment, players };
            }
            catch (error) {
                console.error('Search error:', error);
                results = { equipment: [], players: [] };
            }
        }
        return c.render(_jsx(SearchPage, { query: query, results: results }));
    });
    // Category pages
    app.get('/equipment', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const [recentEquipment, recentReviews, categories] = await Promise.all([
                apiService.getRecentEquipment(8),
                apiService.getRecentReviews(6),
                apiService.getEquipmentCategories(),
            ]);
            return c.render(_jsx(EquipmentIndexPage, { recentEquipment: recentEquipment, recentReviews: recentReviews, categories: categories }));
        }
        catch (error) {
            console.error('Error loading equipment index:', error);
            return c.render(_jsx(EquipmentIndexPage, { recentEquipment: [], recentReviews: [], categories: [] }));
        }
    });
    app.get('/players', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const players = await apiService.getAllPlayers();
            return c.render(_jsx(PlayersListPage, { players: players }));
        }
        catch (error) {
            console.error('Error fetching players:', error);
            return c.render(_jsx(PlayersListPage, { players: [] }));
        }
    });
    // Authentication pages
    app.get('/login', c => {
        return c.render(_jsx(LoginPage, {}));
    });
    app.get('/profile', c => {
        return c.render(_jsx(ProfilePage, {}));
    });
    // Admin pages
    app.get('/admin', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const stats = await apiService.getModerationStats();
            return c.render(_jsx(AdminPage, { stats: stats }));
        }
        catch (error) {
            console.error('Error loading admin dashboard:', error);
            return c.render(_jsx(AdminPage, { stats: {
                    pending: 0,
                    approved: 0,
                    rejected: 0,
                    total: 0,
                    playerEditsPending: 0,
                    playerEditsApproved: 0,
                    playerEditsRejected: 0,
                    playerEditsTotal: 0,
                    equipmentSubmissionsPending: 0,
                    equipmentSubmissionsApproved: 0,
                    equipmentSubmissionsRejected: 0,
                    equipmentSubmissionsTotal: 0,
                } }));
        }
    });
    app.get('/admin/reviews', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const { reviews, total } = await apiService.getPendingReviews(50, 0);
            return c.render(_jsx(AdminReviewsPage, { reviews: reviews, total: total }));
        }
        catch (error) {
            console.error('Error loading pending reviews:', error);
            return c.render(_jsx(AdminReviewsPage, { reviews: [], total: 0 }));
        }
    });
    app.get('/admin/player-edits', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const { playerEdits, total } = await apiService.getPendingPlayerEdits(50, 0);
            return c.render(_jsx(AdminPlayerEditsPage, { playerEdits: playerEdits, total: total }));
        }
        catch (error) {
            console.error('Error loading pending player edits:', error);
            return c.render(_jsx(AdminPlayerEditsPage, { playerEdits: [], total: 0 }));
        }
    });
    app.get('/admin/equipment-submissions', async (c) => {
        try {
            const apiService = new InternalApiService(c);
            const { equipmentSubmissions, total } = await apiService.getPendingEquipmentSubmissions(50, 0);
            return c.render(_jsx(AdminEquipmentSubmissionsPage, { equipmentSubmissions: equipmentSubmissions, total: total }));
        }
        catch (error) {
            console.error('Error loading pending equipment submissions:', error);
            return c.render(_jsx(AdminEquipmentSubmissionsPage, { equipmentSubmissions: [], total: 0 }));
        }
    });
    // Built-in error handler for unhandled errors
    app.onError((err, c) => {
        console.error('Unhandled error:', err);
        c.header('Content-Type', 'application/json');
        c.status(500);
        return c.json({
            error: err.message || 'Internal Server Error',
            timestamp: new Date().toISOString(),
        });
    });
    // 404 handler for unmatched routes
    app.notFound(c => {
        if (c.req.path.startsWith('/api/')) {
            c.header('Content-Type', 'application/json');
            return c.json({ error: 'Not Found', timestamp: new Date().toISOString() }, 404);
        }
        c.status(404);
        return c.render(_jsxs("div", { children: [_jsx("h1", { children: "404 - Page Not Found" }), _jsx("p", { children: "The page you're looking for doesn't exist." })] }));
    });
    return app;
}
