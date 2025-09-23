export function formatApiResponse(data: any, title: string, description: string): string {
  const statusColor = getStatusColor(data.status);
  const statusIcon = getStatusIcon(data.status);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - SyncedUp Call AI</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    }

    .header h1 {
      color: #1a202c;
      font-size: 28px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header .description {
      color: #718096;
      font-size: 14px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      color: white;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    }

    .card h2 {
      color: #2d3748;
      font-size: 18px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e2e8f0;
    }

    .metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f7fafc;
    }

    .metric-row:last-child {
      border-bottom: none;
    }

    .metric-label {
      color: #718096;
      font-size: 14px;
    }

    .metric-value {
      color: #2d3748;
      font-weight: 600;
      font-size: 14px;
    }

    .json-view {
      background: #f7fafc;
      border-radius: 8px;
      padding: 16px;
      margin-top: 12px;
      overflow-x: auto;
    }

    .json-view pre {
      color: #2d3748;
      font-size: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .footer {
      text-align: center;
      color: white;
      font-size: 12px;
      margin-top: 40px;
      opacity: 0.9;
    }

    .timestamp {
      color: #a0aec0;
      font-size: 12px;
      margin-top: 12px;
    }

    .healthy { background-color: #48bb78; }
    .degraded { background-color: #ed8936; }
    .unhealthy, .outage { background-color: #f56565; }
    .operational { background-color: #48bb78; }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      background: #4299e1;
      transition: width 0.3s ease;
    }

    .service-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .service-item {
      background: #f7fafc;
      padding: 12px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .service-name {
      color: #4a5568;
      font-size: 14px;
      font-weight: 500;
    }

    .service-status {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }

    .raw-json-toggle {
      background: #5a67d8;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 12px;
    }

    .raw-json-toggle:hover {
      background: #4c51bf;
    }

    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        ${statusIcon ? `<span style="font-size: 24px;">${statusIcon}</span>` : ''}
        ${title}
        ${data.status ? `<span class="status-badge ${data.status}">${data.status.toUpperCase()}</span>` : ''}
      </h1>
      <p class="description">${description}</p>
      ${data.timestamp ? `<p class="timestamp">Last Updated: ${new Date(data.timestamp).toLocaleString()}</p>` : ''}
    </div>

    <div id="formatted-content">
      ${formatContent(data, title)}
    </div>

    <button class="raw-json-toggle" onclick="toggleRawJson()">Toggle Raw JSON</button>

    <div id="raw-json" class="card hidden">
      <h2>Raw JSON Response</h2>
      <div class="json-view">
        <pre>${JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>

    <div class="footer">
      <p>SyncedUp Call AI - Operational Monitoring System</p>
      <p>© ${new Date().getFullYear()} All Rights Reserved</p>
    </div>
  </div>

  <script>
    function toggleRawJson() {
      const rawJson = document.getElementById('raw-json');
      const formattedContent = document.getElementById('formatted-content');

      if (rawJson.classList.contains('hidden')) {
        rawJson.classList.remove('hidden');
        formattedContent.classList.add('hidden');
      } else {
        rawJson.classList.add('hidden');
        formattedContent.classList.remove('hidden');
      }
    }

    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
  `.trim();
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'healthy':
    case 'operational':
      return '#48bb78';
    case 'degraded':
      return '#ed8936';
    case 'unhealthy':
    case 'outage':
      return '#f56565';
    default:
      return '#718096';
  }
}

function getStatusIcon(status?: string): string {
  switch (status) {
    case 'healthy':
    case 'operational':
      return '✅';
    case 'degraded':
      return '⚠️';
    case 'unhealthy':
    case 'outage':
      return '❌';
    default:
      return '📊';
  }
}

function formatContent(data: any, endpoint: string): string {
  if (endpoint.includes('Health')) {
    return formatHealthContent(data);
  } else if (endpoint.includes('System Metrics')) {
    return formatSystemMetricsContent(data);
  } else if (endpoint.includes('Job Metrics')) {
    return formatJobMetricsContent(data);
  } else if (endpoint.includes('Error Metrics')) {
    return formatErrorMetricsContent(data);
  }

  // Default formatting
  return formatGenericContent(data);
}

function formatHealthContent(data: any): string {
  let html = '<div class="grid">';

  // Services Card
  if (data.services) {
    html += `
      <div class="card">
        <h2>Services Health</h2>
        <div class="service-grid">`;

    Object.entries(data.services).forEach(([name, service]: [string, any]) => {
      const color = getStatusColor(service.status);
      html += `
        <div class="service-item">
          <span class="service-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
          <span class="service-status" style="background: ${color}">
            ${service.status}${service.latency ? ` (${service.latency}ms)` : ''}
          </span>
        </div>`;
    });

    html += `
        </div>
      </div>`;
  }

  // Queue Status Card
  if (data.queue) {
    html += `
      <div class="card">
        <h2>Queue Status</h2>
        <div class="metric-row">
          <span class="metric-label">Pending</span>
          <span class="metric-value">${data.queue.pending}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Processing</span>
          <span class="metric-value">${data.queue.processing}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Failed</span>
          <span class="metric-value" style="color: ${data.queue.failed > 0 ? '#f56565' : 'inherit'}">
            ${data.queue.failed}
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Completed (Last Hour)</span>
          <span class="metric-value">${data.queue.completed_last_hour}</span>
        </div>
      </div>`;
  }

  // Resources Card
  if (data.resources) {
    const memPercent = data.resources.memory?.percent || 0;
    html += `
      <div class="card">
        <h2>System Resources</h2>
        <div class="metric-row">
          <span class="metric-label">Memory Usage</span>
          <span class="metric-value">${data.resources.memory?.used_mb}MB / ${data.resources.memory?.total_mb}MB</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${memPercent}%"></div>
        </div>
        ${data.resources.pool ? `
        <div class="metric-row" style="margin-top: 12px;">
          <span class="metric-label">DB Pool Utilization</span>
          <span class="metric-value">${data.resources.pool.utilization}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${data.resources.pool.utilization}%"></div>
        </div>
        ` : ''}
      </div>`;
  }

  // Error Summary Card
  if (data.errors) {
    html += `
      <div class="card">
        <h2>Error Summary</h2>
        <div class="metric-row">
          <span class="metric-label">Errors (Last Hour)</span>
          <span class="metric-value">${data.errors.last_hour}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Critical Errors</span>
          <span class="metric-value" style="color: ${data.errors.critical_count > 0 ? '#f56565' : 'inherit'}">
            ${data.errors.critical_count}
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Buffer Size</span>
          <span class="metric-value">${data.errors.buffer_size}</span>
        </div>
      </div>`;
  }

  // Environment Card
  if (data.environment) {
    html += `
      <div class="card">
        <h2>Environment</h2>
        <div class="metric-row">
          <span class="metric-label">Node Environment</span>
          <span class="metric-value">${data.environment.node_env}</span>
        </div>
        ${data.environment.vercel_env ? `
        <div class="metric-row">
          <span class="metric-label">Vercel Environment</span>
          <span class="metric-value">${data.environment.vercel_env}</span>
        </div>` : ''}
        ${data.environment.commit_sha ? `
        <div class="metric-row">
          <span class="metric-label">Commit SHA</span>
          <span class="metric-value">${data.environment.commit_sha}</span>
        </div>` : ''}
        <div class="metric-row">
          <span class="metric-label">Uptime</span>
          <span class="metric-value">${formatUptime(data.uptime || 0)}</span>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function formatSystemMetricsContent(data: any): string {
  let html = '<div class="grid">';

  // Process Metrics
  if (data.process) {
    html += `
      <div class="card">
        <h2>Process Information</h2>
        <div class="metric-row">
          <span class="metric-label">Process ID</span>
          <span class="metric-value">${data.process.pid}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Uptime</span>
          <span class="metric-value">${formatUptime(data.process.uptime)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Node Version</span>
          <span class="metric-value">${data.process.node_version}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Platform</span>
          <span class="metric-value">${data.process.platform}</span>
        </div>
      </div>`;
  }

  // Memory Metrics
  if (data.memory) {
    html += `
      <div class="card">
        <h2>Memory Usage</h2>
        <div class="metric-row">
          <span class="metric-label">Heap Used</span>
          <span class="metric-value">${data.memory.heap_used_mb}MB</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Heap Total</span>
          <span class="metric-value">${data.memory.heap_total_mb}MB</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">External</span>
          <span class="metric-value">${data.memory.external_mb}MB</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Usage Percentage</span>
          <span class="metric-value">${data.memory.percent}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${data.memory.percent}%"></div>
        </div>
      </div>`;
  }

  // Database Pool Metrics
  if (data.database_pool) {
    html += `
      <div class="card">
        <h2>Database Connection Pool</h2>
        <div class="metric-row">
          <span class="metric-label">Total Connections</span>
          <span class="metric-value">${data.database_pool.total}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Active</span>
          <span class="metric-value">${data.database_pool.active}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Idle</span>
          <span class="metric-value">${data.database_pool.idle}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Waiting</span>
          <span class="metric-value">${data.database_pool.waiting}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Utilization</span>
          <span class="metric-value">${data.database_pool.utilization}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${data.database_pool.utilization}%"></div>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function formatJobMetricsContent(data: any): string {
  let html = '<div class="grid">';

  // Recording Queue Metrics
  if (data.recording_queue) {
    html += `
      <div class="card">
        <h2>Recording Queue</h2>
        <div class="metric-row">
          <span class="metric-label">Pending</span>
          <span class="metric-value">${data.recording_queue.pending}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Processing</span>
          <span class="metric-value">${data.recording_queue.processing}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Failed (24h)</span>
          <span class="metric-value" style="color: ${data.recording_queue.failed_24h > 10 ? '#f56565' : 'inherit'}">
            ${data.recording_queue.failed_24h}
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Completed (24h)</span>
          <span class="metric-value" style="color: #48bb78">${data.recording_queue.completed_24h}</span>
        </div>
        ${data.recording_queue.throughput ? `
        <div class="metric-row">
          <span class="metric-label">Throughput</span>
          <span class="metric-value">${data.recording_queue.throughput.per_hour}/hour</span>
        </div>` : ''}
      </div>`;
  }

  // Transcription Queue Metrics
  if (data.transcription_queue) {
    html += `
      <div class="card">
        <h2>Transcription Queue</h2>
        <div class="metric-row">
          <span class="metric-label">Pending</span>
          <span class="metric-value">${data.transcription_queue.pending}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Processing</span>
          <span class="metric-value">${data.transcription_queue.processing}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Completed (24h)</span>
          <span class="metric-value" style="color: #48bb78">${data.transcription_queue.completed_24h}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Success Rate</span>
          <span class="metric-value">${(data.transcription_queue.success_rate * 100).toFixed(1)}%</span>
        </div>
        ${data.transcription_queue.avg_duration_seconds ? `
        <div class="metric-row">
          <span class="metric-label">Avg Duration</span>
          <span class="metric-value">${data.transcription_queue.avg_duration_seconds.toFixed(0)}s</span>
        </div>` : ''}
      </div>`;
  }

  // Analysis Jobs Metrics
  if (data.analysis_jobs) {
    html += `
      <div class="card">
        <h2>Analysis Jobs</h2>
        <div class="metric-row">
          <span class="metric-label">Pending</span>
          <span class="metric-value">${data.analysis_jobs.pending}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Completed (24h)</span>
          <span class="metric-value" style="color: #48bb78">${data.analysis_jobs.completed_24h}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Success Rate</span>
          <span class="metric-value">${(data.analysis_jobs.success_rate * 100).toFixed(1)}%</span>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function formatErrorMetricsContent(data: any): string {
  let html = '<div class="grid">';

  // Error Summary
  if (data.summary) {
    html += `
      <div class="card">
        <h2>Error Summary</h2>
        <div class="metric-row">
          <span class="metric-label">Total (24h)</span>
          <span class="metric-value">${data.summary.total_24h}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Total (1h)</span>
          <span class="metric-value">${data.summary.total_1h}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Critical</span>
          <span class="metric-value" style="color: ${data.summary.critical > 0 ? '#f56565' : 'inherit'}">
            ${data.summary.critical}
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">High Severity</span>
          <span class="metric-value" style="color: ${data.summary.high > 0 ? '#ed8936' : 'inherit'}">
            ${data.summary.high}
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Medium</span>
          <span class="metric-value">${data.summary.medium}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Low</span>
          <span class="metric-value">${data.summary.low}</span>
        </div>
      </div>`;
  }

  // Errors by Category
  if (data.by_category) {
    html += `
      <div class="card">
        <h2>Errors by Category</h2>`;

    Object.entries(data.by_category).forEach(([category, count]) => {
      html += `
        <div class="metric-row">
          <span class="metric-label">${category}</span>
          <span class="metric-value">${count}</span>
        </div>`;
    });

    html += `</div>`;
  }

  // Recent Critical Errors
  if (data.recent_critical && data.recent_critical.length > 0) {
    html += `
      <div class="card" style="grid-column: 1 / -1;">
        <h2>Recent Critical Errors</h2>
        <div style="max-height: 300px; overflow-y: auto;">`;

    data.recent_critical.forEach((error: any) => {
      html += `
        <div style="background: #fff5f5; border-left: 4px solid #f56565; padding: 12px; margin-bottom: 8px; border-radius: 4px;">
          <div style="font-weight: 600; color: #c53030; margin-bottom: 4px;">
            ${error.message || 'Unknown Error'}
          </div>
          <div style="color: #718096; font-size: 12px;">
            ${new Date(error.created_at).toLocaleString()}
            ${error.endpoint ? ` • Endpoint: ${error.endpoint}` : ''}
          </div>
        </div>`;
    });

    html += `
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function formatGenericContent(data: any): string {
  let html = '<div class="card">';
  html += '<h2>Response Data</h2>';
  html += '<div class="json-view">';
  html += `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  html += '</div>';
  html += '</div>';
  return html;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '0m';
}