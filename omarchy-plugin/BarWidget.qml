import QtQuick
import QtQuick.Controls
import QtQuick.Window
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "followcast"
  ipcTarget: "followcast"

  property bool ready: false
  property bool sharing: false
  property string mode: "idle"
  property string hiddenApp: ""
  property var monitors: []
  property var catalog: ({})
  property string selectedMonitor: ""
  property string filterText: ""

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dimColor: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.55)
  readonly property color hideColor: Qt.rgba(0.95, 0.62, 0.35, 1)
  readonly property color okColor: Qt.rgba(0.45, 0.82, 0.52, 1)
  readonly property color trackColor: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.22)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string cli: {
    var home = String(Quickshell.env("HOME") || "")
    return home + "/.local/bin/followcast"
  }
  readonly property string iconPath: {
    var url = String(Qt.resolvedUrl("icon.png"))
    return url.startsWith("file://") ? url : ("file://" + url)
  }
  readonly property string sharingPath: {
    var url = String(Qt.resolvedUrl("sharing.py"))
    return url.startsWith("file://") ? url.substring(7) : url
  }
  readonly property string appsPath: {
    var url = String(Qt.resolvedUrl("apps.py"))
    return url.startsWith("file://") ? url.substring(7) : url
  }
  readonly property string statusLabel: root.mode === "hidden" ? "Hidden" : (root.mode === "live" ? "Live" : "Idle")
  readonly property string shareLabel: root.sharing ? "Sharing" : "Not sharing"

  readonly property var selected: {
    for (var i = 0; i < monitors.length; i++)
      if (monitors[i].name === selectedMonitor) return monitors[i]
    return monitors.length ? monitors[0] : null
  }

  readonly property var visibleApps: {
    var mon = selected
    var apps = mon && mon.apps ? mon.apps : []
    var q = String(filterText || "").toLowerCase()
    if (!q) return apps
    var list = []
    for (var i = 0; i < apps.length; i++) {
      var app = apps[i]
      var name = String(root.displayNameForClass(app.className) || "").toLowerCase()
      var cls = String(app.className || "").toLowerCase()
      if (name.indexOf(q) >= 0 || cls.indexOf(q) >= 0) list.push(app)
    }
    return list
  }

  readonly property int sharedAppCount: {
    var apps = selected && selected.apps ? selected.apps : []
    var n = 0
    for (var i = 0; i < apps.length; i++) if (apps[i].enabled) n++
    return n
  }

  function apply(payload) {
    try { var d = JSON.parse(String(payload)) } catch (e) { return }
    ready = true
    var decision = d.decision || {}
    mode = decision.kind === "privacy" ? "hidden" : (decision.kind === "follow" ? "live" : "idle")
    hiddenApp = decision.kind === "privacy" ? String(decision.appLabel || "") : ""
    monitors = Array.isArray(d.monitors) ? d.monitors : []
    if (!selectedMonitor && monitors.length)
      selectedMonitor = monitors[0].name
  }

  function refresh() {
    if (!collectProc.running) collectProc.running = true
    if (!shareProc.running) shareProc.running = true
    if (!appsProc.running && Object.keys(root.catalog).length === 0)
      appsProc.running = true
  }

  function patchMonitor(name, enabled) {
    var next = []
    for (var i = 0; i < monitors.length; i++) {
      var mon = monitors[i]
      if (mon.name === name) {
        next.push({ name: mon.name, enabled: enabled, apps: mon.apps || [] })
      } else {
        next.push(mon)
      }
    }
    monitors = next
  }

  function patchApp(className, enabled) {
    var next = []
    for (var i = 0; i < monitors.length; i++) {
      var mon = monitors[i]
      var apps = []
      var src = mon.apps || []
      for (var j = 0; j < src.length; j++) {
        var app = src[j]
        if (app.className === className)
          apps.push({ className: app.className, title: app.title, enabled: enabled })
        else
          apps.push(app)
      }
      next.push({ name: mon.name, enabled: mon.enabled, apps: apps })
    }
    monitors = next
  }

  function setMonitor(name, enabled) {
    patchMonitor(name, enabled)
    setProc.command = [root.cli, "policy", "set-monitor", name, enabled ? "on" : "off"]
    setProc.running = true
  }

  function setApp(className, enabled) {
    patchApp(className, enabled)
    setProc.command = [root.cli, "policy", "set-app", className, enabled ? "on" : "off"]
    setProc.running = true
  }

  function triggerPress(button) {
    root.toggle()
  }

  function classKeys(className) {
    var cls = String(className || "")
    var lower = cls.toLowerCase()
    var keys = [lower]
    var last = lower.split(".").pop()
    if (last && keys.indexOf(last) < 0) keys.push(last)
    var dash = lower.indexOf("-")
    var host = ""
    if (dash > 0) {
      var rest = lower.slice(dash + 1)
      var cut = rest.indexOf("__")
      host = cut >= 0 ? rest.slice(0, cut) : rest
      if (host && keys.indexOf(host) < 0) keys.push(host)
      var label = host.split(".")[0]
      if (label && keys.indexOf(label) < 0) keys.push(label)
    }
    if (lower.indexOf("discord") >= 0 && keys.indexOf("discord") < 0) keys.push("discord")
    return keys
  }

  function catalogHit(className) {
    var keys = root.classKeys(className)
    for (var i = 0; i < keys.length; i++) {
      var hit = root.catalog[keys[i]]
      if (hit && hit.name) return hit
    }
    return null
  }

  function prettyClassName(className) {
    var raw = String(className || "")
    if (!raw) return "App"
    var last = raw.split(".").pop()
    var dash = last.indexOf("-")
    if (dash > 0 && last.indexOf(".") < 0) last = last.slice(0, dash)
    last = last.replace(/[_-]+/g, " ")
    if (!last) return "App"
    return last.charAt(0).toUpperCase() + last.slice(1)
  }

  function displayNameForClass(className) {
    var hit = root.catalogHit(className)
    if (hit) return hit.name
    var lower = String(className || "").toLowerCase()
    if (lower.indexOf("discord") >= 0) return "Discord"
    if (lower.indexOf("spotify") >= 0) return "Spotify"
    if (lower.indexOf("thunderbird") >= 0) return "Thunderbird"
    if (lower.indexOf("telegram") >= 0) return "Telegram"
    if (lower.indexOf("1password") >= 0) return "1Password"
    if (lower === "zcode") return "ZCode"
    if (lower.indexOf("brave") >= 0) return "Brave"
    return root.prettyClassName(className)
  }

  function iconNameForClass(className) {
    var hit = root.catalogHit(className)
    if (hit && hit.icon) return hit.icon
    var cls = String(className || "")
    var lower = cls.toLowerCase()
    if (lower.indexOf("discord") >= 0) return "discord"
    if (lower.indexOf("spotify") >= 0) return "spotify-client"
    if (lower.indexOf("thunderbird") >= 0) return "org.mozilla.Thunderbird"
    if (lower.indexOf("telegram") >= 0) return "org.telegram.desktop"
    if (lower.indexOf("1password") >= 0) return "1password"
    if (lower === "zcode") return "code"
    if (lower.indexOf("brave") >= 0) return "brave-desktop"
    var parts = cls.split(".")
    return parts[parts.length - 1] || cls
  }

  function iconSourceForClass(className) {
    var name = root.iconNameForClass(className)
    var themed = Quickshell.iconPath(name, true)
    if (themed && themed.length > 0) return themed
    var raw = Quickshell.iconPath(String(className || ""), true)
    if (raw && raw.length > 0) return raw
    return Quickshell.iconPath("application-x-executable", true)
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Process {
    id: collectProc
    command: [root.cli, "status"]
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.apply(text) }
  }

  Process {
    id: setProc
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.refresh() }
  }

  Process {
    id: appsProc
    command: ["python3", root.appsPath]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          var d = JSON.parse(String(text))
          root.catalog = d.apps && typeof d.apps === "object" ? d.apps : ({})
        } catch (e) {
          root.catalog = ({})
        }
      }
    }
  }

  Process {
    id: shareProc
    command: ["python3", root.sharingPath]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          var d = JSON.parse(String(text))
          root.sharing = d.sharing === true
        } catch (e) {
          root.sharing = false
        }
      }
    }
  }

  Timer {
    interval: 2000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  onOpenedChanged: if (!root.opened) root.filterText = ""
  Component.onCompleted: appsProc.running = true

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    pressable: true
    horizontalMargin: 8
    fixedWidth: chip.implicitWidth + scaledHorizontalMargin * 2
    onPressed: function(b) { root.triggerPress(b) }

    Row {
      id: chip
      anchors.centerIn: parent
      spacing: Style.space(8)

      Image {
        width: Style.space(18)
        height: Style.space(18)
        anchors.verticalCenter: parent.verticalCenter
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        sourceSize.width: width * Screen.devicePixelRatio
        sourceSize.height: height * Screen.devicePixelRatio
        source: root.iconPath
      }

      Text {
        text: "Followcast"
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        text: root.statusLabel
        color: root.mode === "hidden" ? root.hideColor : (root.mode === "live" ? root.okColor : root.dimColor)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        text: "·"
        color: root.dimColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        text: root.shareLabel
        color: root.sharing ? root.okColor : root.dimColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        anchors.verticalCenter: parent.verticalCenter
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    contentWidth: panel.fittedContentWidth(Style.space(560))
    contentHeight: panel.fittedContentHeight(Style.space(520), Style.space(680))

    Item {
      anchors.fill: parent

      Column {
        anchors.fill: parent
        spacing: Style.space(12)

        PanelHero {
          width: parent.width
          title: "Followcast"
          detail: root.mode === "hidden" ? "Hidden" : (root.mode === "live" ? "Live" : "Idle")
          meta: (root.sharing ? "Sharing now" : "Not sharing")
            + " · "
            + (root.mode === "hidden"
              ? ("privacy card" + (root.hiddenApp ? " · " + root.hiddenApp : ""))
              : "focused allowed app")
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        TextField {
          width: parent.width
          placeholderText: "Filter applications"
          text: root.filterText
          onTextChanged: root.filterText = text
        }

        Row {
          width: parent.width
          height: parent.height - y
          spacing: Style.space(12)

          Flickable {
            id: monList
            width: Style.space(188)
            height: parent.height
            clip: true
            contentWidth: width
            contentHeight: monCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds

            Column {
              id: monCol
              width: monList.width
              spacing: Style.space(4)

              PanelSectionHeader {
                text: "MONITORS"
                foreground: root.foreground
                fontFamily: root.fontFamily
              }

              Repeater {
                model: root.monitors
                delegate: BorderSurface {
                  required property var modelData
                  width: monCol.width
                  height: monInner.implicitHeight + Style.space(14)
                  radius: Style.spacing.labelGap
                  color: root.selected && root.selected.name === modelData.name
                    ? Style.selectedFillFor(root.foreground, Color.accent)
                    : "transparent"
                  borderSpec: root.selected && root.selected.name === modelData.name
                    ? Border.controlSpec("normal", root.foreground, Color.accent)
                    : Border.none()

                  Column {
                    id: monInner
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(8)
                    spacing: Style.space(2)

                    Row {
                      width: parent.width
                      spacing: Style.space(6)
                      Rectangle {
                        width: Style.space(7)
                        height: width
                        radius: width / 2
                        color: modelData.enabled ? root.okColor : root.hideColor
                        anchors.verticalCenter: parent.verticalCenter
                      }
                      Text {
                        width: parent.width - Style.space(16)
                        text: modelData.name
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                        elide: Text.ElideRight
                      }
                    }

                    Text {
                      width: parent.width
                      text: modelData.enabled
                        ? ((modelData.apps ? modelData.apps.length : 0) + " apps")
                        : "muted"
                      color: root.dimColor
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selectedMonitor = modelData.name
                  }
                }
              }
            }
          }

          Column {
            width: parent.width - Style.space(188) - parent.spacing
            height: parent.height
            spacing: Style.space(8)
            clip: true

            Row {
              width: parent.width
              spacing: Style.space(10)

              Column {
                width: parent.width - monToggle.width - parent.spacing
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(2)

                Text {
                  width: parent.width
                  text: root.selected ? root.selected.name : "No monitors"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  elide: Text.ElideRight
                }

                Text {
                  width: parent.width
                  visible: !!(root.selected && root.selected.enabled)
                  text: root.sharedAppCount + " of "
                    + (root.selected && root.selected.apps ? root.selected.apps.length : 0)
                    + " apps shared"
                  color: root.dimColor
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                }
              }

              ToggleSwitch {
                id: monToggle
                visible: !!root.selected
                checked: !!(root.selected && root.selected.enabled)
                foreground: root.foreground
                anchors.verticalCenter: parent.verticalCenter
                onToggled: if (root.selected) root.setMonitor(root.selected.name, !root.selected.enabled)
              }
            }

            Text {
              width: parent.width
              visible: !!(root.selected && !root.selected.enabled)
              text: "This monitor is muted. The audience sees the Followcast privacy card."
              color: root.dimColor
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }

            PanelSectionHeader {
              visible: !!(root.selected && root.selected.enabled)
              text: "APPLICATIONS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Flickable {
              id: appList
              width: parent.width
              height: parent.height - y
              clip: true
              visible: !!(root.selected && root.selected.enabled)
              contentWidth: width
              contentHeight: appCol.implicitHeight
              boundsBehavior: Flickable.StopAtBounds

              Column {
                id: appCol
                width: appList.width
                spacing: Style.space(2)

                Repeater {
                  model: root.visibleApps
                  delegate: Item {
                    required property var modelData
                    width: appCol.width
                    height: Style.space(44)
                    clip: true

                    Image {
                      id: appIcon
                      width: Style.space(20)
                      height: Style.space(20)
                      anchors.left: parent.left
                      anchors.leftMargin: Style.space(4)
                      anchors.verticalCenter: parent.verticalCenter
                      fillMode: Image.PreserveAspectFit
                      asynchronous: true
                      sourceSize.width: width * Screen.devicePixelRatio
                      sourceSize.height: height * Screen.devicePixelRatio
                      source: root.iconSourceForClass(modelData.className)
                    }

                    Text {
                      anchors.left: appIcon.right
                      anchors.leftMargin: Style.space(10)
                      anchors.right: appSwitch.left
                      anchors.rightMargin: Style.space(10)
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.displayNameForClass(modelData.className)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      elide: Text.ElideRight
                      maximumLineCount: 1
                      wrapMode: Text.NoWrap
                    }

                    ToggleSwitch {
                      id: appSwitch
                      anchors.right: parent.right
                      anchors.rightMargin: Style.space(4)
                      anchors.verticalCenter: parent.verticalCenter
                      checked: !!modelData.enabled
                      foreground: root.foreground
                      onToggled: root.setApp(modelData.className, !modelData.enabled)
                    }

                    MouseArea {
                      anchors.fill: parent
                      anchors.rightMargin: appSwitch.width + Style.space(8)
                      cursorShape: Qt.PointingHandCursor
                      onClicked: root.setApp(modelData.className, !modelData.enabled)
                    }
                  }
                }

                Text {
                  width: parent.width
                  visible: root.visibleApps.length === 0
                  text: root.filterText ? "No applications match that filter." : "No applications on this monitor."
                  color: root.dimColor
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }
            }
          }
        }
      }
    }
  }
}
