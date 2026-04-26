using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var forceOpenSettings = args.Any(a => string.Equals(a, "--settings", StringComparison.OrdinalIgnoreCase));
        Application.Run(new AgentApplicationContext(forceOpenSettings));
    }
}

internal sealed class AgentApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly AgentReporter _reporter;
    private readonly string _configPath;
    private AgentConfig _config;
    private SettingsForm? _settingsForm;

    public AgentApplicationContext(bool forceOpenSettings)
    {
        _configPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        _config = ConfigStore.LoadOrCreate(_configPath);

        _reporter = new AgentReporter(AppContext.BaseDirectory);
        _reporter.UpdateConfig(_config);
        _reporter.Start();

        var menu = new ContextMenuStrip();
        menu.Items.Add("打开设置", null, (_, _) => ShowSettings());
        menu.Items.Add("打开日志目录", null, (_, _) => OpenLogsDirectory());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, (_, _) => ExitThread());

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Live Dashboard Agent",
            Visible = true,
            ContextMenuStrip = menu,
        };
        _notifyIcon.DoubleClick += (_, _) => ShowSettings();

        if (forceOpenSettings || string.IsNullOrWhiteSpace(_config.Token))
        {
            ShowSettings();
        }
        else
        {
            _notifyIcon.ShowBalloonTip(
                2500,
                "Live Dashboard",
                "Windows Agent 已在后台运行。双击托盘图标可打开设置。",
                ToolTipIcon.Info);
        }
    }

    private void ShowSettings()
    {
        if (_settingsForm is { IsDisposed: false })
        {
            _settingsForm.Activate();
            return;
        }

        _settingsForm = new SettingsForm(_config.Clone());
        _settingsForm.ConfigSaved += OnConfigSaved;
        _settingsForm.FormClosed += (_, _) => _settingsForm = null;
        _settingsForm.Show();
        _settingsForm.Activate();
    }

    private void OpenLogsDirectory()
    {
        var logDir = Path.Combine(AppContext.BaseDirectory, "logs");
        Directory.CreateDirectory(logDir);
        Process.Start(new ProcessStartInfo
        {
            FileName = logDir,
            UseShellExecute = true,
        });
    }

    private void OnConfigSaved(AgentConfig config)
    {
        _config = config.Clone();
        ConfigStore.Save(_configPath, _config);
        _reporter.UpdateConfig(_config);

        _notifyIcon.ShowBalloonTip(
            2000,
            "Live Dashboard",
            "设置已保存并立即生效。",
            ToolTipIcon.Info);
    }

    protected override void ExitThreadCore()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();

        _reporter.StopAsync().GetAwaiter().GetResult();
        base.ExitThreadCore();
    }
}

internal sealed class SettingsForm : Form
{
    private readonly TextBox _serverUrlTextBox;
    private readonly TextBox _tokenTextBox;
    private readonly NumericUpDown _reportIntervalNumeric;
    private readonly NumericUpDown _heartbeatIntervalNumeric;
    private readonly NumericUpDown _afkThresholdNumeric;
    private readonly CheckBox _enableLogCheckBox;
    private readonly DataGridView _customRulesGrid;

    public event Action<AgentConfig>? ConfigSaved;

    public SettingsForm(AgentConfig config)
    {
        Text = "Live Dashboard - 设置";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(600, 560);
        Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        var layoutPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16),
        };
        Controls.Add(layoutPanel);

        var labelWidth = 120;
        var inputWidth = 430;
        var rowHeight = 34;
        var y = 8;

        AddLabel(layoutPanel, "服务器地址:", 8, y, labelWidth);
        _serverUrlTextBox = AddTextBox(layoutPanel, 128, y - 2, inputWidth);
        y += rowHeight;

        AddLabel(layoutPanel, "Token:", 8, y, labelWidth);
        _tokenTextBox = AddTextBox(layoutPanel, 128, y - 2, inputWidth);
        _tokenTextBox.UseSystemPasswordChar = true;
        y += rowHeight;

        AddLabel(layoutPanel, "上报间隔 (秒):", 8, y, labelWidth);
        _reportIntervalNumeric = AddNumeric(layoutPanel, 128, y - 2, 120, 3, 300);
        y += rowHeight;

        AddLabel(layoutPanel, "心跳间隔 (秒):", 8, y, labelWidth);
        _heartbeatIntervalNumeric = AddNumeric(layoutPanel, 128, y - 2, 120, 10, 3600);
        y += rowHeight;

        AddLabel(layoutPanel, "AFK 判定 (秒):", 8, y, labelWidth);
        _afkThresholdNumeric = AddNumeric(layoutPanel, 128, y - 2, 120, 30, 7200);
        y += rowHeight;

        _enableLogCheckBox = new CheckBox
        {
            Left = 8,
            Top = y,
            Width = 220,
            Height = 24,
            Text = "开启日志文件 (保留 2 天)",
        };
        layoutPanel.Controls.Add(_enableLogCheckBox);
        y += 36;

        var group = new GroupBox
        {
            Left = 8,
            Top = y,
            Width = 552,
            Height = 270,
            Text = "自定义应用名称和文案",
        };
        layoutPanel.Controls.Add(group);

        _customRulesGrid = new DataGridView
        {
            Left = 12,
            Top = 28,
            Width = 526,
            Height = 190,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        };
        _customRulesGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "应用进程(app_id)",
            Name = "AppId",
            FillWeight = 30,
        });
        _customRulesGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "自定义应用名称",
            Name = "CustomAppName",
            FillWeight = 25,
        });
        _customRulesGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "自定义文案 (支持 {title} {appId})",
            Name = "CustomDescription",
            FillWeight = 45,
        });
        group.Controls.Add(_customRulesGrid);

        var addRuleButton = new Button
        {
            Left = 12,
            Top = 226,
            Width = 90,
            Height = 30,
            Text = "新增规则",
        };
        addRuleButton.Click += (_, _) => _customRulesGrid.Rows.Add("", "", "");
        group.Controls.Add(addRuleButton);

        var removeRuleButton = new Button
        {
            Left = 108,
            Top = 226,
            Width = 90,
            Height = 30,
            Text = "删除选中",
        };
        removeRuleButton.Click += (_, _) =>
        {
            if (_customRulesGrid.SelectedRows.Count > 0)
            {
                _customRulesGrid.Rows.RemoveAt(_customRulesGrid.SelectedRows[0].Index);
            }
        };
        group.Controls.Add(removeRuleButton);

        var saveButton = new Button
        {
            Left = 350,
            Top = 520,
            Width = 100,
            Height = 30,
            Text = "保存",
        };
        saveButton.Click += (_, _) => SaveConfig();
        Controls.Add(saveButton);

        var cancelButton = new Button
        {
            Left = 460,
            Top = 520,
            Width = 100,
            Height = 30,
            Text = "取消",
        };
        cancelButton.Click += (_, _) => Close();
        Controls.Add(cancelButton);

        BindConfig(config);
    }

    private static Label AddLabel(Control parent, string text, int x, int y, int width)
    {
        var label = new Label
        {
            Left = x,
            Top = y + 4,
            Width = width,
            Height = 22,
            Text = text,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        parent.Controls.Add(label);
        return label;
    }

    private static TextBox AddTextBox(Control parent, int x, int y, int width)
    {
        var textBox = new TextBox
        {
            Left = x,
            Top = y,
            Width = width,
            Height = 24,
        };
        parent.Controls.Add(textBox);
        return textBox;
    }

    private static NumericUpDown AddNumeric(Control parent, int x, int y, int width, int min, int max)
    {
        var numeric = new NumericUpDown
        {
            Left = x,
            Top = y,
            Width = width,
            Height = 24,
            Minimum = min,
            Maximum = max,
        };
        parent.Controls.Add(numeric);
        return numeric;
    }

    private void BindConfig(AgentConfig config)
    {
        _serverUrlTextBox.Text = config.ServerUrl;
        _tokenTextBox.Text = config.Token;
        _reportIntervalNumeric.Value = Math.Clamp(config.ReportIntervalSeconds, 3, 300);
        _heartbeatIntervalNumeric.Value = Math.Clamp(config.HeartbeatIntervalSeconds, 10, 3600);
        _afkThresholdNumeric.Value = Math.Clamp(config.AfkThresholdSeconds, 30, 7200);
        _enableLogCheckBox.Checked = config.EnableLogFile;

        _customRulesGrid.Rows.Clear();
        foreach (var rule in config.CustomApps)
        {
            _customRulesGrid.Rows.Add(rule.AppId, rule.CustomAppName, rule.CustomDescription);
        }
    }

    private void SaveConfig()
    {
        var serverUrl = _serverUrlTextBox.Text.Trim();
        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "http" && uri.Scheme != "https"))
        {
            MessageBox.Show(this, "服务器地址必须是 http:// 或 https:// 开头。", "设置校验", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var token = _tokenTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            MessageBox.Show(this, "Token 不能为空。", "设置校验", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var reportInterval = (int)_reportIntervalNumeric.Value;
        var heartbeatInterval = Math.Max((int)_heartbeatIntervalNumeric.Value, reportInterval);
        var afkThreshold = Math.Max((int)_afkThresholdNumeric.Value, reportInterval);

        var rules = new List<CustomAppRule>();
        foreach (DataGridViewRow row in _customRulesGrid.Rows)
        {
            if (row.IsNewRow) continue;

            var appId = (row.Cells["AppId"].Value?.ToString() ?? string.Empty).Trim();
            var customAppName = (row.Cells["CustomAppName"].Value?.ToString() ?? string.Empty).Trim();
            var customDescription = (row.Cells["CustomDescription"].Value?.ToString() ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(appId)) continue;

            rules.Add(new CustomAppRule
            {
                AppId = appId,
                CustomAppName = customAppName,
                CustomDescription = customDescription,
            });
        }

        var config = new AgentConfig
        {
            ServerUrl = serverUrl,
            Token = token,
            ReportIntervalSeconds = reportInterval,
            HeartbeatIntervalSeconds = heartbeatInterval,
            AfkThresholdSeconds = afkThreshold,
            EnableLogFile = _enableLogCheckBox.Checked,
            UserAgent = "live-dashboard-windows-agent/2.0.0",
            CustomApps = rules,
        };

        ConfigSaved?.Invoke(ConfigStore.Normalize(config));
        Close();
    }
}

internal sealed class AgentReporter
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly object _sync = new();
    private readonly string _baseDir;
    private readonly string _logDir;

    private CancellationTokenSource? _cts;
    private Task? _runTask;
    private AgentConfig _config = AgentConfig.Default();
    private DateTimeOffset _lastSentAt = DateTimeOffset.MinValue;
    private string _lastSentAppId = string.Empty;
    private string _lastSentTitle = string.Empty;
    private DateOnly _lastCleanupDate = DateOnly.MinValue;

    public AgentReporter(string baseDir)
    {
        _baseDir = baseDir;
        _logDir = Path.Combine(_baseDir, "logs");
    }

    public void UpdateConfig(AgentConfig config)
    {
        lock (_sync)
        {
            _config = config.Clone();
        }
    }

    public void Start()
    {
        lock (_sync)
        {
            if (_runTask is { IsCompleted: false }) return;

            _cts = new CancellationTokenSource();
            _runTask = Task.Run(() => RunAsync(_cts.Token));
        }
    }

    public async Task StopAsync()
    {
        CancellationTokenSource? cts;
        Task? runTask;

        lock (_sync)
        {
            cts = _cts;
            runTask = _runTask;
            _cts = null;
            _runTask = null;
        }

        if (cts is null) return;

        cts.Cancel();
        if (runTask is not null)
        {
            try
            {
                await runTask;
            }
            catch
            {
                // Ignore shutdown exceptions.
            }
        }

        cts.Dispose();
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var config = GetConfigSnapshot();

            try
            {
                await TickAsync(config, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                WriteLog(config, $"[error] {ex.Message}");
            }

            var delaySeconds = Math.Clamp(config.ReportIntervalSeconds, 3, 300);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private AgentConfig GetConfigSnapshot()
    {
        lock (_sync)
        {
            return _config.Clone();
        }
    }

    private async Task TickAsync(AgentConfig config, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(config.Token))
        {
            WriteLog(config, "[warn] token 为空，已暂停上报。请在设置中填写 Token。");
            return;
        }

        var baseUrl = NormalizeBaseUrl(config.ServerUrl);
        if (baseUrl is null)
        {
            WriteLog(config, "[warn] serverUrl 无效，已暂停上报。请在设置中修正地址。");
            return;
        }

        var snapshot = ReadSnapshot(config.AfkThresholdSeconds);
        var rule = FindMatchingRule(config.CustomApps, snapshot.AppId);

        var customAppName = string.Empty;
        var customDescription = string.Empty;

        if (rule is not null)
        {
            customAppName = Truncate(rule.CustomAppName.Trim(), 64);
            customDescription = Truncate(
                RenderTemplate(rule.CustomDescription, snapshot, customAppName),
                256);
        }

        var now = DateTimeOffset.UtcNow;
        var heartbeatInterval = TimeSpan.FromSeconds(Math.Clamp(config.HeartbeatIntervalSeconds, 10, 3600));
        var isChanged = !string.Equals(snapshot.AppId, _lastSentAppId, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(snapshot.WindowTitle, _lastSentTitle, StringComparison.Ordinal);
        var isHeartbeatDue = now - _lastSentAt >= heartbeatInterval;

        if (_lastSentAt != DateTimeOffset.MinValue && !isChanged && !isHeartbeatDue)
        {
            return;
        }

        var payload = new ReportPayload
        {
            AppId = snapshot.AppId,
            WindowTitle = Truncate(snapshot.WindowTitle, 256),
            Timestamp = now.ToString("O"),
            Extra = string.IsNullOrWhiteSpace(customAppName) && string.IsNullOrWhiteSpace(customDescription)
                ? null
                : new ReportExtra
                {
                    CustomAppName = string.IsNullOrWhiteSpace(customAppName) ? null : customAppName,
                    CustomDescription = string.IsNullOrWhiteSpace(customDescription) ? null : customDescription,
                },
        };

        using var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(15),
            BaseAddress = new Uri(baseUrl),
        };
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", config.Token.Trim());

        var userAgent = string.IsNullOrWhiteSpace(config.UserAgent)
            ? "live-dashboard-windows-agent/2.0.0"
            : config.UserAgent.Trim();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);

        var json = JsonSerializer.Serialize(payload, PayloadJsonOptions);
        using var content = new StringContent(json, Encoding.UTF8);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");

        using var response = await client.PostAsync(
            "/api/report",
            content,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            WriteLog(config, $"[http {(int)response.StatusCode}] {body}");
            return;
        }

        _lastSentAt = now;
        _lastSentAppId = snapshot.AppId;
        _lastSentTitle = snapshot.WindowTitle;

        var descriptionPart = string.IsNullOrWhiteSpace(customDescription) ? "" : $" | 文案: {customDescription}";
        var appNamePart = string.IsNullOrWhiteSpace(customAppName) ? "" : $" | 应用名: {customAppName}";
        WriteLog(config, $"[ok] {snapshot.AppId} | {snapshot.WindowTitle}{appNamePart}{descriptionPart}");
    }

    private void WriteLog(AgentConfig config, string message)
    {
        if (!config.EnableLogFile) return;

        Directory.CreateDirectory(_logDir);
        CleanupOldLogs();

        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}";
        var logFile = Path.Combine(_logDir, $"agent-{DateTime.Now:yyyyMMdd}.log");
        File.AppendAllText(logFile, line, Encoding.UTF8);
    }

    private void CleanupOldLogs()
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (_lastCleanupDate == today) return;

        _lastCleanupDate = today;
        if (!Directory.Exists(_logDir)) return;

        var cutoff = DateTime.Now.AddDays(-2);
        foreach (var file in Directory.GetFiles(_logDir, "agent-*.log"))
        {
            try
            {
                var created = File.GetCreationTime(file);
                var modified = File.GetLastWriteTime(file);
                if (created < cutoff && modified < cutoff)
                {
                    File.Delete(file);
                }
            }
            catch
            {
                // Ignore cleanup failures.
            }
        }
    }

    private static ForegroundSnapshot ReadSnapshot(int afkThresholdSeconds)
    {
        var idleSeconds = NativeMethods.GetIdleSeconds();
        if (idleSeconds >= Math.Clamp(afkThresholdSeconds, 30, 7200))
        {
            return new ForegroundSnapshot
            {
                AppId = "windows.afk",
                WindowTitle = "用户离开中",
                IdleSeconds = idleSeconds,
            };
        }

        var hwnd = NativeMethods.GetForegroundWindow();
        if (hwnd == nint.Zero)
        {
            return new ForegroundSnapshot
            {
                AppId = "windows.idle",
                WindowTitle = "桌面空闲",
                IdleSeconds = idleSeconds,
            };
        }

        _ = NativeMethods.GetWindowThreadProcessId(hwnd, out var processId);
        var title = NativeMethods.GetWindowTitle(hwnd);

        var processName = "windows.unknown";
        if (processId != 0)
        {
            try
            {
                using var process = Process.GetProcessById((int)processId);
                processName = process.ProcessName;
            }
            catch
            {
                processName = "windows.unknown";
            }
        }

        if (string.IsNullOrWhiteSpace(title))
        {
            title = processName;
        }

        return new ForegroundSnapshot
        {
            AppId = processName,
            WindowTitle = title,
            IdleSeconds = idleSeconds,
        };
    }

    private static string? NormalizeBaseUrl(string value)
    {
        var trimmed = value.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)) return null;
        if (!string.Equals(uri.Scheme, "http", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        if (string.IsNullOrWhiteSpace(uri.Host)) return null;
        return trimmed;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private static CustomAppRule? FindMatchingRule(IEnumerable<CustomAppRule> rules, string appId)
    {
        foreach (var rule in rules)
        {
            var pattern = rule.AppId.Trim();
            if (string.IsNullOrWhiteSpace(pattern)) continue;
            if (IsAppMatch(pattern, appId)) return rule;
        }
        return null;
    }

    private static bool IsAppMatch(string pattern, string appId)
    {
        if (string.Equals(pattern, appId, StringComparison.OrdinalIgnoreCase)) return true;

        if (!pattern.Contains('*'))
        {
            return false;
        }

        if (pattern.StartsWith('*') && pattern.EndsWith('*') && pattern.Length > 2)
        {
            var fragment = pattern[1..^1];
            return appId.Contains(fragment, StringComparison.OrdinalIgnoreCase);
        }

        if (pattern.StartsWith('*') && pattern.Length > 1)
        {
            var suffix = pattern[1..];
            return appId.EndsWith(suffix, StringComparison.OrdinalIgnoreCase);
        }

        if (pattern.EndsWith('*') && pattern.Length > 1)
        {
            var prefix = pattern[..^1];
            return appId.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    private static string RenderTemplate(string template, ForegroundSnapshot snapshot, string customAppName)
    {
        if (string.IsNullOrWhiteSpace(template)) return string.Empty;

        var appLabel = string.IsNullOrWhiteSpace(customAppName) ? snapshot.AppId : customAppName;
        return template
            .Replace("{title}", snapshot.WindowTitle, StringComparison.OrdinalIgnoreCase)
            .Replace("{appId}", snapshot.AppId, StringComparison.OrdinalIgnoreCase)
            .Replace("{app}", appLabel, StringComparison.OrdinalIgnoreCase)
            .Trim();
    }
}

internal static class ConfigStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = null,
    };

    public static AgentConfig LoadOrCreate(string path)
    {
        if (!File.Exists(path))
        {
            var defaults = AgentConfig.Default();
            Save(path, defaults);
            return defaults;
        }

        try
        {
            var text = File.ReadAllText(path, Encoding.UTF8);
            var parsed = JsonSerializer.Deserialize<AgentConfig>(text, Options);
            return Normalize(parsed ?? AgentConfig.Default());
        }
        catch
        {
            var fallback = AgentConfig.Default();
            Save(path, fallback);
            return fallback;
        }
    }

    public static void Save(string path, AgentConfig config)
    {
        var normalized = Normalize(config);
        var json = JsonSerializer.Serialize(normalized, Options);
        File.WriteAllText(path, json, Encoding.UTF8);
    }

    public static AgentConfig Normalize(AgentConfig config)
    {
        var rules = config.CustomApps
            .Where(r => !string.IsNullOrWhiteSpace(r.AppId))
            .Select(r => new CustomAppRule
            {
                AppId = r.AppId.Trim(),
                CustomAppName = Truncate(r.CustomAppName.Trim(), 64),
                CustomDescription = Truncate(r.CustomDescription.Trim(), 256),
            })
            .ToList();

        var report = Math.Clamp(config.ReportIntervalSeconds, 3, 300);
        var heartbeat = Math.Max(Math.Clamp(config.HeartbeatIntervalSeconds, 10, 3600), report);
        var afk = Math.Max(Math.Clamp(config.AfkThresholdSeconds, 30, 7200), report);

        return new AgentConfig
        {
            ServerUrl = config.ServerUrl.Trim(),
            Token = config.Token.Trim(),
            ReportIntervalSeconds = report,
            HeartbeatIntervalSeconds = heartbeat,
            AfkThresholdSeconds = afk,
            EnableLogFile = config.EnableLogFile,
            UserAgent = string.IsNullOrWhiteSpace(config.UserAgent)
                ? "live-dashboard-windows-agent/2.0.0"
                : config.UserAgent.Trim(),
            CustomApps = rules,
        };
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength) return value;
        return value[..maxLength];
    }
}

internal sealed class AgentConfig
{
    [JsonPropertyName("serverUrl")]
    public string ServerUrl { get; init; } = "http://127.0.0.1:3000";

    [JsonPropertyName("token")]
    public string Token { get; init; } = string.Empty;

    [JsonPropertyName("reportIntervalSeconds")]
    public int ReportIntervalSeconds { get; init; } = 5;

    [JsonPropertyName("heartbeatIntervalSeconds")]
    public int HeartbeatIntervalSeconds { get; init; } = 60;

    [JsonPropertyName("afkThresholdSeconds")]
    public int AfkThresholdSeconds { get; init; } = 300;

    [JsonPropertyName("enableLogFile")]
    public bool EnableLogFile { get; init; } = false;

    [JsonPropertyName("userAgent")]
    public string UserAgent { get; init; } = "live-dashboard-windows-agent/2.0.0";

    [JsonPropertyName("customApps")]
    public List<CustomAppRule> CustomApps { get; init; } = new();

    public AgentConfig Clone()
    {
        return new AgentConfig
        {
            ServerUrl = ServerUrl,
            Token = Token,
            ReportIntervalSeconds = ReportIntervalSeconds,
            HeartbeatIntervalSeconds = HeartbeatIntervalSeconds,
            AfkThresholdSeconds = AfkThresholdSeconds,
            EnableLogFile = EnableLogFile,
            UserAgent = UserAgent,
            CustomApps = CustomApps
                .Select(r => new CustomAppRule
                {
                    AppId = r.AppId,
                    CustomAppName = r.CustomAppName,
                    CustomDescription = r.CustomDescription,
                })
                .ToList(),
        };
    }

    public static AgentConfig Default()
    {
        return new AgentConfig
        {
            ServerUrl = "http://127.0.0.1:3000",
            Token = string.Empty,
            ReportIntervalSeconds = 5,
            HeartbeatIntervalSeconds = 60,
            AfkThresholdSeconds = 300,
            EnableLogFile = false,
            UserAgent = "live-dashboard-windows-agent/2.0.0",
            CustomApps = new List<CustomAppRule>
            {
                new()
                {
                    AppId = "chrome",
                    CustomAppName = "浏览器",
                    CustomDescription = "正在浏览: {title}",
                },
            },
        };
    }
}

internal sealed class CustomAppRule
{
    [JsonPropertyName("appId")]
    public string AppId { get; init; } = string.Empty;

    [JsonPropertyName("customAppName")]
    public string CustomAppName { get; init; } = string.Empty;

    [JsonPropertyName("customDescription")]
    public string CustomDescription { get; init; } = string.Empty;
}

internal sealed class ReportPayload
{
    [JsonPropertyName("app_id")]
    public string AppId { get; init; } = string.Empty;

    [JsonPropertyName("window_title")]
    public string WindowTitle { get; init; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; init; } = string.Empty;

    [JsonPropertyName("extra")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ReportExtra? Extra { get; init; }
}

internal sealed class ReportExtra
{
    [JsonPropertyName("custom_app_name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CustomAppName { get; init; }

    [JsonPropertyName("custom_description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CustomDescription { get; init; }
}

internal sealed class ForegroundSnapshot
{
    public string AppId { get; init; } = "windows.unknown";
    public string WindowTitle { get; init; } = string.Empty;
    public int IdleSeconds { get; init; }
}

internal static partial class NativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern nint GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(nint hWnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(nint hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetLastInputInfo(ref LastInputInfo plii);

    public static string GetWindowTitle(nint hWnd)
    {
        var sb = new StringBuilder(512);
        _ = GetWindowTextW(hWnd, sb, sb.Capacity);
        return sb.ToString().Trim();
    }

    public static int GetIdleSeconds()
    {
        var info = new LastInputInfo
        {
            cbSize = (uint)Marshal.SizeOf<LastInputInfo>(),
            dwTime = 0,
        };

        if (!GetLastInputInfo(ref info))
        {
            return 0;
        }

        var tickNow = unchecked((uint)Environment.TickCount);
        var idleMilliseconds = unchecked(tickNow - info.dwTime);
        return (int)(idleMilliseconds / 1000);
    }
}
