using System.Text.Json;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Shapes;
using Windows.UI;
using WidBar.SDK;

namespace WidBar.Followcast;

public sealed class FollowcastPlugin : WidgetPluginBase, IConfigurableWidgetPlugin, IWidgetFlyoutLifecycle
{
    public const string PluginId = "com.blitz.followcast";

    private static readonly Color LiveColor = Color.FromArgb(0xFF, 0x73, 0xD1, 0x85);
    private static readonly Color HiddenColor = Color.FromArgb(0xFF, 0xF2, 0x9E, 0x59);
    private static readonly Color IdleColor = Color.FromArgb(0xFF, 0x9A, 0xA3, 0xB5);

    private Settings _settings = new();
    private FollowcastStatus? _status;
    private DispatcherQueue? _dispatcher;
    private CancellationTokenSource? _cts;
    private bool _flyoutOpen;

    private Ellipse? _previewDot;
    private TextBlock? _previewLabel;
    private StackPanel? _flyoutPanel;

    public override string Id => PluginId;
    public override string Name => "Followcast";
    public override int FlyoutWidth => 380;
    public override int FlyoutHeight => 540;
    public override int PreviewLogicalWidth => 112;

    private sealed class Settings
    {
        public string? CliPath { get; set; }

        public static Settings FromJson(string? json)
        {
            try
            {
                return string.IsNullOrWhiteSpace(json)
                    ? new Settings()
                    : JsonSerializer.Deserialize<Settings>(json) ?? new Settings();
            }
            catch
            {
                return new Settings();
            }
        }

        public string ToJson() => JsonSerializer.Serialize(this);
    }

    public override async Task InitializeAsync(IWidgetContext context)
    {
        _settings = Settings.FromJson(context.SettingsJson);
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        await base.InitializeAsync(context);
        _cts = new CancellationTokenSource();
        _ = PollLoopAsync(_cts.Token);
    }

    private async Task PollLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        do
        {
            if (!_flyoutOpen && !(Context?.IsPreviewVisible ?? true)) continue;
            await RefreshOnceAsync(ct);
        }
        while (await WaitAsync(timer, ct));
    }

    private async Task RefreshOnceAsync(CancellationToken ct)
    {
        FollowcastStatus next;
        try
        {
            next = await FollowcastClient.FetchStatusAsync(_settings.CliPath, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            next = new FollowcastStatus(null, [], ex.Message);
        }
        _dispatcher?.TryEnqueue(() => Apply(next));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try
        {
            return await timer.WaitForNextTickAsync(ct);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    private void Apply(FollowcastStatus status)
    {
        _status = status;
        RenderPreview();
        if (_flyoutOpen) RenderFlyout();
    }

    private (string Label, Color Color) ModeVisual()
    {
        var kind = _status?.Decision?.Kind;
        return kind switch
        {
            "privacy" => ("Hidden", HiddenColor),
            "follow" => ("Live", LiveColor),
            _ => ("Idle", IdleColor),
        };
    }

    public override UIElement? CreatePreviewContent()
    {
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 7,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            Padding = new Thickness(8, 0, 8, 0),
        };

        var iconPath = System.IO.Path.Combine(AppContext.BaseDirectory, "Icons", "followcast.png");
        if (File.Exists(iconPath))
        {
            row.Children.Add(new Image
            {
                Source = new BitmapImage(new Uri(iconPath)),
                Width = 16,
                Height = 16,
                VerticalAlignment = VerticalAlignment.Center,
            });
        }

        _previewDot = new Ellipse
        {
            Width = 8,
            Height = 8,
            Fill = new SolidColorBrush(IdleColor),
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(_previewDot);

        _previewLabel = new TextBlock
        {
            Text = "Idle",
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(_previewLabel);

        RenderPreview();
        return row;
    }

    private void RenderPreview()
    {
        if (_previewDot is null || _previewLabel is null) return;
        var (label, color) = ModeVisual();
        _previewDot.Fill = new SolidColorBrush(color);
        _previewLabel.Text = label;
    }

    public override UIElement? CreateFlyoutContent()
    {
        _flyoutPanel = new StackPanel
        {
            Spacing = 12,
            Padding = new Thickness(16),
        };
        RenderFlyout();
        return new ScrollViewer
        {
            Content = _flyoutPanel,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
    }

    public void OnFlyoutShown()
    {
        _flyoutOpen = true;
        RenderFlyout();
        if (_cts is { } cts) _ = RefreshOnceAsync(cts.Token);
    }

    public void OnFlyoutHidden()
    {
        _flyoutOpen = false;
    }

    private void RenderFlyout()
    {
        if (_flyoutPanel is null) return;
        _flyoutPanel.Children.Clear();

        var (label, color) = ModeVisual();
        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var titleStack = new StackPanel { Spacing = 2 };
        titleStack.Children.Add(new TextBlock
        {
            Text = "Followcast",
            FontSize = 18,
            FontWeight = FontWeights.SemiBold,
        });
        var subtitle = _status?.Decision?.Kind == "privacy" && !string.IsNullOrWhiteSpace(_status.Decision.AppLabel)
            ? $"Hidden · {_status.Decision.AppLabel}"
            : label;
        titleStack.Children.Add(new TextBlock
        {
            Text = subtitle,
            FontSize = 12,
            Foreground = new SolidColorBrush(color),
            FontWeight = FontWeights.SemiBold,
        });
        Grid.SetColumn(titleStack, 0);
        header.Children.Add(titleStack);

        var refreshBtn = new Button { Content = "Refresh", VerticalAlignment = VerticalAlignment.Center };
        refreshBtn.Click += async (_, _) =>
        {
            if (_cts is { } cts) await RefreshOnceAsync(cts.Token);
        };
        Grid.SetColumn(refreshBtn, 1);
        header.Children.Add(refreshBtn);
        _flyoutPanel.Children.Add(header);

        if (!string.IsNullOrWhiteSpace(_status?.Error))
        {
            _flyoutPanel.Children.Add(new TextBlock
            {
                Text = _status.Error,
                TextWrapping = TextWrapping.Wrap,
                Foreground = new SolidColorBrush(HiddenColor),
                FontSize = 12,
            });
            return;
        }

        var monitors = _status?.Monitors ?? [];

        _flyoutPanel.Children.Add(SectionHeader("Monitors"));
        if (monitors.Count == 0)
        {
            _flyoutPanel.Children.Add(MutedNote("No monitors reported yet."));
        }
        else
        {
            foreach (var mon in monitors)
            {
                _flyoutPanel.Children.Add(ToggleRow(
                    mon.Name,
                    $"{mon.Apps.Count} app(s)",
                    mon.Enabled,
                    async on =>
                    {
                        if (_cts is null) return;
                        try
                        {
                            await FollowcastClient.SetMonitorAsync(_settings.CliPath, mon.Name, on, _cts.Token);
                            await RefreshOnceAsync(_cts.Token);
                        }
                        catch
                        {
                            await RefreshOnceAsync(_cts.Token);
                        }
                    }));
            }
        }

        _flyoutPanel.Children.Add(SectionHeader("Applications"));
        var uniqueApps = monitors
            .SelectMany(m => m.Apps)
            .GroupBy(a => a.ClassName, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(a => a.ClassName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (uniqueApps.Count == 0)
        {
            _flyoutPanel.Children.Add(MutedNote("No open applications detected."));
        }
        else
        {
            foreach (var app in uniqueApps)
            {
                _flyoutPanel.Children.Add(ToggleRow(
                    app.ClassName,
                    app.Title,
                    app.Enabled,
                    async on =>
                    {
                        if (_cts is null) return;
                        try
                        {
                            await FollowcastClient.SetAppAsync(_settings.CliPath, app.ClassName, on, _cts.Token);
                            await RefreshOnceAsync(_cts.Token);
                        }
                        catch
                        {
                            await RefreshOnceAsync(_cts.Token);
                        }
                    }));
            }
        }
    }

    private static TextBlock SectionHeader(string text) => new()
    {
        Text = text,
        FontSize = 12,
        FontWeight = FontWeights.SemiBold,
        Opacity = 0.75,
        Margin = new Thickness(0, 6, 0, 0),
    };

    private static TextBlock MutedNote(string text) => new()
    {
        Text = text,
        FontSize = 12,
        Opacity = 0.6,
    };

    private static Grid ToggleRow(string title, string subtitle, bool isOn, Func<bool, Task> onToggle)
    {
        var grid = new Grid { Padding = new Thickness(0, 2, 0, 2) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var labels = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Spacing = 1 };
        labels.Children.Add(new TextBlock
        {
            Text = title,
            FontSize = 13,
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        if (!string.IsNullOrWhiteSpace(subtitle) && !string.Equals(subtitle, title, StringComparison.Ordinal))
        {
            labels.Children.Add(new TextBlock
            {
                Text = subtitle,
                FontSize = 11,
                Opacity = 0.65,
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        }
        Grid.SetColumn(labels, 0);
        grid.Children.Add(labels);

        var toggle = new ToggleSwitch
        {
            IsOn = isOn,
            OnContent = "",
            OffContent = "",
            MinWidth = 0,
            VerticalAlignment = VerticalAlignment.Center,
        };
        toggle.Toggled += async (_, _) =>
        {
            toggle.IsEnabled = false;
            try
            {
                await onToggle(toggle.IsOn);
            }
            finally
            {
                toggle.IsEnabled = true;
            }
        };
        Grid.SetColumn(toggle, 1);
        grid.Children.Add(toggle);
        return grid;
    }

    public UIElement? CreateSettingsContent(IWidgetSettingsContext context)
    {
        var draft = Settings.FromJson(context.SettingsJson);
        var panel = new StackPanel { Spacing = 10, Padding = new Thickness(12) };
        panel.Children.Add(new TextBlock
        {
            Text = "Followcast CLI path (optional)",
            FontWeight = FontWeights.SemiBold,
        });
        panel.Children.Add(new TextBlock
        {
            Text = "Leave blank to auto-detect followcast.exe on PATH.",
            FontSize = 12,
            Opacity = 0.7,
        });
        var box = new TextBox
        {
            PlaceholderText = @"C:\path\to\followcast.exe",
            Text = draft.CliPath ?? "",
        };
        box.TextChanged += (_, _) =>
        {
            draft.CliPath = string.IsNullOrWhiteSpace(box.Text) ? null : box.Text.Trim();
            context.SaveSettings(draft.ToJson());
            context.RequestPreviewRefresh();
        };
        panel.Children.Add(box);
        return panel;
    }

    public override void OnSettingsDraftChanged(string settingsJson)
    {
        _settings = Settings.FromJson(settingsJson);
        if (_cts is { } cts) _ = RefreshOnceAsync(cts.Token);
    }

    public override ValueTask DisposeAsync()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
        _previewDot = null;
        _previewLabel = null;
        _flyoutPanel = null;
        return ValueTask.CompletedTask;
    }
}
