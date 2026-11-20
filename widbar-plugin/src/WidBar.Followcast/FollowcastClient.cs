using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WidBar.Followcast;

public sealed record FollowcastApp(
    [property: JsonPropertyName("className")] string ClassName,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("enabled")] bool Enabled);

public sealed record FollowcastMonitor(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("apps")] List<FollowcastApp> Apps);

public sealed record FollowcastDecision(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("appLabel")] string? AppLabel);

public sealed record FollowcastStatus(
    [property: JsonPropertyName("decision")] FollowcastDecision? Decision,
    [property: JsonPropertyName("monitors")] List<FollowcastMonitor>? Monitors,
    string? Error = null);

public static class FollowcastClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static (string FileName, string[] PrefixArgs) ResolveCli(string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            var trimmed = configuredPath.Trim();
            if (trimmed.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
                return ("node", [trimmed]);
            return (trimmed, []);
        }

        var fromPath = FindOnPath("followcast.exe") ?? FindOnPath("followcast.cmd");
        if (fromPath is not null)
            return (fromPath, []);

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var localExe = Path.Combine(userProfile, "Development", "Personal", "followcast", "build", "followcast.exe");
        if (File.Exists(localExe))
            return (localExe, []);

        var localDist = Path.Combine(userProfile, "Development", "Personal", "followcast", "dist", "cli.js");
        if (File.Exists(localDist))
            return ("node", [localDist]);

        return ("followcast", []);
    }

    private static string? FindOnPath(string binary)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathEnv)) return null;
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(dir.Trim(), binary);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static async Task<string> RunAsync(string? configuredPath, string[] args, CancellationToken ct)
    {
        var (fileName, prefixArgs) = ResolveCli(configuredPath);
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var a in prefixArgs) psi.ArgumentList.Add(a);
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException($"Could not start {fileName}");
        var stdoutTask = proc.StandardOutput.ReadToEndAsync(ct);
        var stderrTask = proc.StandardError.ReadToEndAsync(ct);
        await proc.WaitForExitAsync(ct);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        if (proc.ExitCode != 0)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr)
                ? $"followcast exited with {proc.ExitCode}"
                : stderr.Trim());
        return stdout;
    }

    public static async Task<FollowcastStatus> FetchStatusAsync(string? configuredPath, CancellationToken ct)
    {
        var json = await RunAsync(configuredPath, ["status"], ct);
        var parsed = JsonSerializer.Deserialize<FollowcastStatus>(json, JsonOptions);
        return parsed ?? new FollowcastStatus(null, [], "Invalid status JSON");
    }

    public static Task SetMonitorAsync(string? configuredPath, string monitorName, bool enabled, CancellationToken ct) =>
        RunAsync(configuredPath, ["policy", "set-monitor", monitorName, enabled ? "on" : "off"], ct);

    public static Task SetAppAsync(string? configuredPath, string className, bool enabled, CancellationToken ct) =>
        RunAsync(configuredPath, ["policy", "set-app", className, enabled ? "on" : "off"], ct);
}
