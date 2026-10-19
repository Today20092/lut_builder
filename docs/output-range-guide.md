# Choosing a LUT output range

LUT Builder's output-range setting describes values written by the LUT. Full uses
0–1; Video/Legal packs output into 64/1023–940/1023. It does not change the
camera's HDMI output, unpack incoming video levels, or configure a monitor.

The recording range, HDMI transport range, receiver input interpretation, and LUT
input/output domains are separate decisions. A camera model alone cannot safely
select this setting. Keep the existing Full default without presenting it as a
verified preset for every camera or monitor.

## Decision tree

| Destination requirement | Choice | Check separately |
| --- | --- | --- |
| Normalized 0–1 LUT output | Full / Data | Host input interpretation |
| Explicit video-range values inside the LUT | Video / Legal | No second output packing |
| Undocumented LUT domain | Retain Full provisionally | Destination instructions and a known ramp |
| Legal-range LUT input as well as output | Output setting alone is insufficient | A documented input adapter |

> **Range belongs to a stage.** Camera HDMI range, receiving input interpretation,
> and values written by the LUT are separate settings. Changing output packing
> does not repair an input mismatch.

1. Identify where the LUT runs: camera, external monitor, or software.
2. Check that destination's LUT instructions, including expected input and output
   domains. If it expects ordinary normalized 0–1 LUT output, choose Full.
3. Choose Video/Legal only when the destination explicitly requires video-range
   values inside the LUT. Check that it will not apply the same output packing
   again. If the destination requires legal-range LUT input as well, the current
   output-only option is not a complete adapter.
4. Configure the camera's HDMI range and receiver's input interpretation to agree,
   independently of this setting. Ensure the receiver gets the selected log
   encoding rather than a camera-applied viewing conversion.
5. If the LUT domain is undocumented, retain Full provisionally and consult the
   destination's instructions/support. Verify a known ramp and gray reference
   through the actual pipeline before relying on exposure judgments. Do not
   diagnose range solely from whether a log picture looks flat.

## Official-source findings

- **Nikon Z6III:** [HDMI recorder instructions](https://onlinemanual.nikonimglib.com/z6III/en/recorders_86.html)
  recommend HDMI Output range Auto in most situations, with Limited (16–235) and
  Full (0–255) alternatives. Nikon identifies this as an RGB HDMI signal setting.
  It is not an instruction to pack a LUT's output into video levels.
- **Panasonic S5II:** [Operating instructions, p363](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2/pdf/DC-S5M2_DVQP2839_full_eng.pdf)
  describe full, video, and extended-video recording luminance ranges. V-Log
  normally fixes the range to 0–1023. The [Real Time LUT update](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2/html/DC-S5M2_DVQP2839_eng/0178.html)
  documents full range with custom V-Log-base LUTs and a video-range exception for
  Panasonic's Vlog_709 LUT. The same camera/gamma can therefore have different
  range handling depending on workflow; recording range does not establish every
  external monitor's LUT domain.
- **Canon EOS R6 V:** [Canon Log HDMI Output Range](https://cam.start.canon/en/C023/manual/html/UG-04_Shooting_0680.html)
  offers Prioritize Full Range and Narrow Range. Full can adapt to display
  specifications; the setting is disabled for RAW HDMI. This evidence applies to
  the named model, not automatically to every EOS R camera.
- **Sony FX3 / a7 III:** the reviewed [FX3 HDMI output guide](https://helpguide.sony.net/ilc/2035/v1/en/contents/TP1000284740.html)
  and [a7 III settings list](https://helpguide.sony.net/ilc/1720/v1/en/contents/TP0001667695.html?search=default)
  do not establish a universal Full/Legal output-domain requirement for external
  .cube LUTs. Do not infer an automatic selection for these cameras.
- **Blackmagic Pocket Cinema Camera:** the [official manual, pp72 and97](https://documents.blackmagicdesign.com/UserManuals/BlackmagicPocketCinemaCamera4KManual.pdf)
  describes separate LCD/HDMI Display 3D LUT controls; Clean Feed does not remove
  an applied LUT. It documents 17/33-point .cube support, including 33-point
  Resolve-format LUTs. It does not establish a universal output-range choice for
  every monitor workflow. Avoid applying the diagnostic LUT twice.
- **SmallHD:** [Look (3D LUT) settings](https://guide.smallhd.com/a/1753041-look-3d-lut)
  distinguish the LUT's Full/Legal Input Data Range and recommend Full when
  unsure. The guide says Output Data Range mirrors Input. An asymmetric
  full-input/legal-output LUT is therefore not automatically interchangeable
  with this monitor's Legal setting. This is not the camera HDMI range control.
- **Atomos Shinobi II:** the [Input Menu guide](https://support.atomos.com/hc/en-us/articles/10342509794959-Input-Menu)
  says Legalize is off by default, off for Log HDR HLG/PQ monitoring, and on for
  Log signals monitored using SDR LUTs in SDR workflows. This is specific input
  processing; it does not independently prove that LUT Builder's output packing
  must also be enabled. Avoid blanket rules for all Atomos products/firmware.

## Suggested interface language

**LUT output range**

- **Full / Data:** Uses 0–1 output values. Keep this unless your LUT destination
  requires video-range values.
- **Video / Legal:** Packs the LUT output into 64–940 (10-bit). Choose only when
  required by your monitor or LUT workflow.

Optional help: Match the device applying this LUT, not just your camera. Camera
HDMI range and monitor input range must also agree. If the device already handles
range conversion, additional packing can produce incorrect black and white
levels. Check its LUT instructions.

## Limits

Reviewed official documentation on 2026-10-19. This is a focused sample of common
camera families and monitor workflows, not a popularity ranking or exhaustive
model/firmware compatibility matrix. No physical camera/monitor validation was
performed. Public manuals do not fully specify every vendor's internal LUT-domain
processing. Camera-specific presets require documented pipeline behavior and
verification, not an assumption based on log gamma or camera price.
