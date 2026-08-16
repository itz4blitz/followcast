import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "followcast"
  ipcTarget: "followcast"

  property bool ready: false
  property string liveLabel: "Followcast"
  property string mode: "idle"
  property var monitors: []
  property string selectedMonitor: ""

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dimColor: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.55)
  readonly property color hideColor: Qt.rgba(0.95, 0.62, 0.35, 1)
  readonly property color okColor: Qt.rgba(0.45, 0.82, 0.52, 1)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string cli: {
    var home = String(Quickshell.env("HOME") || "")
    return home + "/.local/bin/followcast"
  }

  readonly property var selected: {
    for (var i = 0; i < monitors.length; i++)
      if (monitors[i].name === selectedMonitor) return monitors[i]
    return monitors.length ? monitors[0] : null
  }

  function apply(payload) {
    try { var d = JSON.parse(String(payload)) } catch (e) { return }
    ready = true
    var decision = d.decision || {}
    mode = decision.kind === "privacy" ? "hidden" : (decision.kind === "follow" ? "live" : "idle")
    if (decision.kind === "privacy")
      liveLabel = "Hidden · " + String(decision.appLabel || "app")
    else if (decision.kind === "follow")
      liveLabel = "Live"
    else
      liveLabel = "Followcast"
    monitors = Array.isArray(d.monitors) ? d.monitors : []
    if (!selectedMonitor && monitors.length)
      selectedMonitor = monitors[0].name
  }

  function refresh() {
    if (!collectProc.running) collectProc.running = true
  }

  function setMonitor(name, enabled) {
    setProc.command = [root.cli, "policy", "set-monitor", name, enabled ? "on" : "off"]
    setProc.running = true
  }

  function setApp(className, enabled) {
    setProc.command = [root.cli, "policy", "set-app", className, enabled ? "on" : "off"]
    setProc.running = true
  }

  function triggerPress(button) {
    root.toggle()
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

  Timer {
    interval: 1500
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

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
      spacing: Style.space(6)

      Rectangle {
        width: 8
        height: 8
        radius: 4
        anchors.verticalCenter: parent.verticalCenter
        color: root.mode === "hidden" ? root.hideColor : (root.mode === "live" ? root.okColor : root.dimColor)
      }

      Text {
        text: root.liveLabel
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
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
    contentWidth: panel.fittedContentWidth(Style.space(520))
    contentHeight: panel.fittedContentHeight(Style.space(480), Style.space(640))

    Item {
      anchors.fill: parent

      Column {
        anchors.fill: parent
        spacing: Style.space(12)

        PanelHero {
          width: parent.width
          title: "Followcast"
          meta: root.mode === "hidden"
            ? "Privacy filter is covering the focused app"
            : "Audience sees the focused allowed app"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Row {
          width: parent.width
          height: parent.height - y
          spacing: Style.space(12)

          Flickable {
            width: Style.space(180)
            height: parent.height
            clip: true
            contentWidth: width
            contentHeight: monCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds

            Column {
              id: monCol
              width: parent.width
              spacing: Style.space(4)

              PanelSectionHeader {
                text: "MONITORS"
                foreground: root.foreground
                fontFamily: root.fontFamily
              }

              Repeater {
                model: root.monitors
                delegate: Button {
                  required property var modelData
                  width: monCol.width
                  text: (modelData.enabled ? "On  " : "Off ") + modelData.name
                  foreground: root.foreground
                  selected: root.selected && root.selected.name === modelData.name
                  onClicked: root.selectedMonitor = modelData.name
                }
              }
            }
          }

          Column {
            width: parent.width - Style.space(180) - parent.spacing
            height: parent.height
            spacing: Style.space(8)

            Row {
              width: parent.width
              spacing: Style.space(8)

              Text {
                text: root.selected ? root.selected.name : "No monitors"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
              }

              Button {
                visible: !!root.selected
                text: root.selected && root.selected.enabled ? "Mute monitor" : "Share monitor"
                foreground: root.foreground
                onClicked: if (root.selected) root.setMonitor(root.selected.name, !root.selected.enabled)
              }
            }

            Text {
              width: parent.width
              visible: root.selected && !root.selected.enabled
              text: "This entire monitor is off. The audience sees the Followcast privacy card."
              color: root.dimColor
              font.family: root.fontFamily
              wrapMode: Text.WordWrap
            }

            Flickable {
              width: parent.width
              height: parent.height - y
              clip: true
              contentWidth: width
              contentHeight: appCol.implicitHeight
              visible: root.selected && root.selected.enabled
              boundsBehavior: Flickable.StopAtBounds

              Column {
                id: appCol
                width: parent.width
                spacing: Style.space(4)

                PanelSectionHeader {
                  text: "APPLICATIONS"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                }

                Repeater {
                  model: root.selected ? root.selected.apps : []
                  delegate: Button {
                    required property var modelData
                    width: appCol.width
                    text: (modelData.enabled ? "On  " : "Off ") + (modelData.title || modelData.className)
                    foreground: root.foreground
                    onClicked: root.setApp(modelData.className, !modelData.enabled)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
