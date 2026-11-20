using WidBar.SDK;
using WidBar.SDK.Hosting;

namespace WidBar.Followcast;

public partial class App : WidgetHostApplication
{
    public App()
    {
        InitializeComponent();
    }

    protected override IWidgetPlugin CreatePlugin() => new FollowcastPlugin();
}
