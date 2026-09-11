const fs = require('fs');

const sql = fs.readFileSync('schema_for_drawio.sql', 'utf8');

// Parse tables
const tables = [];
const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_\.]+)\s*\(([\s\S]*?)\);/gi;

let match;
while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsText = match[2];
    const columns = [];
    
    const lines = columnsText.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('--') || line.startsWith('PRIMARY KEY') || line.startsWith('UNIQUE') || line.startsWith('CHECK') || line.startsWith('FOREIGN KEY')) {
            continue;
        }
        if (!line) continue;
        
        const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_\(\)]+)/);
        if (colMatch) {
            columns.push({ name: colMatch[1], type: colMatch[2] });
        }
    }
    
    tables.push({ name: tableName, columns: columns });
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" agent="Antigravity" version="20.0.0" type="device">
  <diagram id="schema" name="Database Schema">
    <mxGraphModel dx="1434" dy="836" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />`;

let currentX = 50;
let currentY = 50;
let columnMaxY = 0;

for (const table of tables) {
    const height = 30 + (table.columns.length * 30);
    xml += `
        <mxCell id="table_${table.name}" value="${table.name}" style="shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${currentX}" y="${currentY}" width="220" height="${height}" as="geometry" />
        </mxCell>`;
        
    let i = 0;
    for (const col of table.columns) {
        const y = 30 + (i * 30);
        const colId = `col_${table.name}_${col.name}`;
        xml += `
        <mxCell id="${colId}_row" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="table_${table.name}">
          <mxGeometry y="${y}" width="220" height="30" as="geometry" />
        </mxCell>
        <mxCell id="${colId}_name" value="${col.name}" style="shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;align=left;" vertex="1" parent="${colId}_row">
          <mxGeometry width="120" height="30" as="geometry" />
        </mxCell>
        <mxCell id="${colId}_type" value="${col.type}" style="shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;align=left;" vertex="1" parent="${colId}_row">
          <mxGeometry x="120" width="100" height="30" as="geometry" />
        </mxCell>`;
        i++;
    }
    
    currentX += 270;
    if (height > columnMaxY) columnMaxY = height;
    
    if (currentX > 1800) {
        currentX = 50;
        currentY += columnMaxY + 50;
        columnMaxY = 0;
    }
}

xml += `
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

fs.writeFileSync('NEW_ER_DIAGRAM.drawio', xml);
console.log('Generated NEW_ER_DIAGRAM.drawio');
