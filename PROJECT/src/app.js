require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const authRoutes = require('./routes/auth.routes');
const entriesRoutes = require('./routes/entries.routes');
const trashRoutes = require('./routes/trash.routes');
const errorHandler = require('./middleware/error.middleware');

const app = express();
/* istanbul ignore next */
const port = process.env.PORT || 3000;
const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MyDiary API',
            version: '1.0.0',
            description: 'API documentation for diary entries and trash.'
        },
        servers: [
            {
                url: `http://localhost:${port}`,
                description: 'Local server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                Entry: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        content: { type: 'string', example: 'Today was a good day.' },
                        tag: { type: 'string', nullable: true, example: 'personal' },
                        isRedacted: { type: 'boolean', example: false },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                        userId: { type: 'integer', example: 1 }
                    }
                },
                EntryInput: {
                    type: 'object',
                    required: ['content'],
                    properties: {
                        content: { type: 'string', example: 'Today was a good day.' },
                        tag: { type: 'string', nullable: true, example: 'personal' }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Повідомлення з деталями помилки' }
                    }
                }
            }
        },
        security: [{ bearerAuth: [] }]
    },
    apis: [path.join(__dirname, 'routes', '*.js')]
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/trash', trashRoutes);

app.use(errorHandler);

module.exports = app;
