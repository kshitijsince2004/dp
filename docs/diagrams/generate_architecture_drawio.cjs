const fs = require('fs');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" agent="Antigravity" version="20.0.0" type="device">
  <diagram id="architecture" name="System Flow">
    <mxGraphModel dx="1434" dy="836" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" background="#ffffff" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Scripts -->
        <mxCell id="scripts" value="&lt;b style='font-size: 14px'&gt;Root Scripts&lt;/b&gt;&lt;hr&gt;&lt;div style='text-align: left'&gt;&lt;b&gt;start.bat&lt;/b&gt;: Entry point. Installs dependencies, runs migrations, and launches Frontend, Backend, Worker, and Docker via parallel processes.&lt;br&gt;&lt;br&gt;&lt;b&gt;stop.bat / stop.sh&lt;/b&gt;: Cleanup scripts. Force-kills nodes on ports (5000, 5173, etc.) and runs docker compose down.&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;align=center;verticalAlign=top;spacing=10;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="350" y="30" width="350" height="130" as="geometry" />
        </mxCell>

        <!-- Frontend -->
        <mxCell id="frontend" value="&lt;b style='font-size: 14px'&gt;Frontend (React + Vite)&lt;/b&gt;&lt;hr&gt;&lt;div style='text-align: left'&gt;&lt;b&gt;vite.config.js&lt;/b&gt;: Runs on Port 5173. Proxies /api to Backend (5000).&lt;br&gt;&lt;br&gt;&lt;b&gt;src/main.jsx&lt;/b&gt;: Mounts the React application.&lt;br&gt;&lt;br&gt;&lt;b&gt;src/api/&lt;/b&gt;: Axios interceptors talking to backend REST routes.&lt;br&gt;&lt;br&gt;&lt;b&gt;package.json&lt;/b&gt;: UI dependencies (Tailwind, React Router).&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;align=center;verticalAlign=top;spacing=10;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="50" y="240" width="280" height="170" as="geometry" />
        </mxCell>

        <!-- Backend -->
        <mxCell id="backend" value="&lt;b style='font-size: 14px'&gt;Backend API (Express.js)&lt;/b&gt;&lt;hr&gt;&lt;div style='text-align: left'&gt;&lt;b&gt;index.js&lt;/b&gt;: Starts HTTP server on Port 5000. Wires DB &amp; Event Bus.&lt;br&gt;&lt;br&gt;&lt;b&gt;.env&lt;/b&gt;: Crucial! Maps DATABASE_URL to port 5435.&lt;br&gt;&lt;br&gt;&lt;b&gt;src/config/db.js&lt;/b&gt;: Knex.js query builder connection.&lt;br&gt;&lt;br&gt;&lt;b&gt;migrations/&lt;/b&gt;: 19+ JS files writing raw SQL for PostgreSQL.&lt;br&gt;&lt;br&gt;&lt;b&gt;src/events/&lt;/b&gt;: Publishes background tasks (like reports) to RabbitMQ.&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;align=center;verticalAlign=top;spacing=10;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="380" y="240" width="290" height="210" as="geometry" />
        </mxCell>

        <!-- Worker -->
        <mxCell id="worker" value="&lt;b style='font-size: 14px'&gt;Python Worker&lt;/b&gt;&lt;hr&gt;&lt;div style='text-align: left'&gt;&lt;b&gt;main.py&lt;/b&gt;: Infinite loop. Consumes RabbitMQ queue 'report.requested'.&lt;br&gt;&lt;br&gt;&lt;b&gt;db.py&lt;/b&gt;: Loads backend/.env. Connects to PostgreSQL via SQLAlchemy.&lt;br&gt;&lt;br&gt;&lt;b&gt;generator.py&lt;/b&gt;: Fetches SQL data and generates heavy Excel/PDF reports locally.&lt;br&gt;&lt;br&gt;&lt;b&gt;requirements.txt&lt;/b&gt;: Pika (MQ), SQLAlchemy (DB).&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;align=center;verticalAlign=top;spacing=10;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="720" y="240" width="280" height="180" as="geometry" />
        </mxCell>

        <!-- Docker -->
        <mxCell id="docker" value="&lt;b style='font-size: 14px'&gt;Docker Infrastructure&lt;/b&gt;&lt;hr&gt;&lt;div style='text-align: left'&gt;&lt;b&gt;docker-compose.yml&lt;/b&gt;: Spawns 3 isolated containers.&lt;br&gt;&lt;br&gt;&lt;b&gt;1. PostgreSQL (db)&lt;/b&gt;: Port 5435. Primary relational store.&lt;br&gt;&lt;br&gt;&lt;b&gt;2. RabbitMQ (rabbitmq)&lt;/b&gt;: Port 5672. Async message broker for decoupling backend/worker.&lt;br&gt;&lt;br&gt;&lt;b&gt;3. Redis (redis)&lt;/b&gt;: Port 6379. In-memory caching.&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;align=center;verticalAlign=top;spacing=10;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="380" y="550" width="290" height="180" as="geometry" />
        </mxCell>

        <!-- Connections (Edges) -->
        
        <!-- Start -> Frontend -->
        <mxCell id="edge_start_ui" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="scripts" target="frontend">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <!-- Start -> Backend -->
        <mxCell id="edge_start_api" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="scripts" target="backend">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <!-- Start -> Worker -->
        <mxCell id="edge_start_worker" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="scripts" target="worker">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Frontend <-> Backend -->
        <mxCell id="edge_ui_api" value="&lt;b&gt;REST HTTP calls&lt;/b&gt;&lt;br&gt;(Proxied to 5000)" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;fontColor=#000000;" edge="1" parent="1" source="frontend" target="backend">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Backend <-> DB -->
        <mxCell id="edge_api_db" value="&lt;b&gt;SQL Queries (Port 5435)&lt;/b&gt;&lt;br&gt;Reads/Writes data" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.25;exitY=1;exitDx=0;exitDy=0;entryX=0.25;entryY=0;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#10739e;" edge="1" parent="1" source="backend" target="docker">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <!-- Backend <-> RabbitMQ -->
        <mxCell id="edge_api_mq" value="&lt;b&gt;AMQP (Port 5672)&lt;/b&gt;&lt;br&gt;Publishes Jobs" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.75;exitY=1;exitDx=0;exitDy=0;entryX=0.75;entryY=0;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#b85450;" edge="1" parent="1" source="backend" target="docker">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Worker <-> RabbitMQ -->
        <mxCell id="edge_worker_mq" value="&lt;b&gt;AMQP (Port 5672)&lt;/b&gt;&lt;br&gt;Consumes Jobs" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#b85450;" edge="1" parent="1" source="docker" target="worker">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="860" y="640" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- Worker <-> DB -->
        <mxCell id="edge_worker_db" value="&lt;b&gt;SQL Queries (Port 5435)&lt;/b&gt;&lt;br&gt;Fetches data / Updates status" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.25;exitY=1;exitDx=0;exitDy=0;entryX=1;entryY=0.25;entryDx=0;entryDy=0;strokeWidth=2;strokeColor=#10739e;" edge="1" parent="1" source="worker" target="docker">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="790" y="595" />
            </Array>
          </mxGeometry>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

fs.writeFileSync('SYSTEM_ARCHITECTURE.drawio', xml);
console.log('Generated SYSTEM_ARCHITECTURE.drawio');
