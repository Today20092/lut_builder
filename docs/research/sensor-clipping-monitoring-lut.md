# Can a monitoring LUT show irreversible sensor clipping?

## Short answer

**Sometimes, but only as a camera-specific approximation.** A 3D LUT can reliably mark documented code-value regions in the exact log feed it was built for. It cannot, by itself, prove physical sensor saturation or recover camera metadata. A credible “sensor limit” mode therefore has to be keyed by camera model, sensor/readout mode, log encoding, EI/ISO, signal range, and firmware/recording path—not merely by the name of a log curve.

The high end is the stronger case. If a manufacturer documents where a particular camera configuration maps sensor saturation into its log signal, a matching LUT can mark that boundary or a safety region immediately below it. At the low end there normally is no comparable hard cliff: detail becomes progressively dominated by noise. Manufacturer false-color systems commonly define an SNR-based noise floor or “black detail loss,” not a universal physical black-clipping value.

## Why a generic 3D LUT cannot know for certain

A `.cube` LUT receives only an RGB triplet and returns an RGB triplet. It has no camera model, EI, codec, sensor mode, white-balance state, or SDI range unless the operator selects the matching LUT and configures the signal path correctly. Identical encoded RGB values can arise from a saturated photosite, a color-channel matrix result, an in-camera clip, a range conversion, or ordinary scene content. Once several sensor exposures have collapsed to the same recorded value, that ambiguity is itself irreversible; the LUT can flag the value but cannot identify which upstream operation caused it.

Signal plumbing matters. Sony documents S-Log3 file and SDI output as full range, using nominal 10-bit values 0–1023, whereas ARRI documents the LogC SDI signals in its false-color specification as 10-bit legal range and warns that intervening equipment may rescale them. A threshold applied under the wrong range convention is wrong even if its camera code value was otherwise correct. ([Sony S-Log3 technical summary](https://download.pro.sony/FNGP/protein/1237494271390/1237494271406.pdf), [ARRI LogC False Color specification](https://www.arri.com/resource/blob/390448/2d469ae1e98110562fe347cea50a284b/arri-logc-false-color-specification-data.pdf))

White balance and gamut processing also matter because a conventional monitoring LUT sees processed log RGB, not raw photosites. Sony explicitly distinguishes 16-bit scene-linear RAW from S-Log3-encoded RGB. RED states that its exposure false color is evaluated after ISO and white-balance adjustments and before a LUT/transform; that placement is information a downstream LUT cannot infer. ([Sony S-Log3 technical summary](https://download.pro.sony/FNGP/protein/1237494271390/1237494271406.pdf), [RED False Color Exposure Mode](https://docs.red.com/955-0190_v1.3/955-0190_v1.3_REV-1.1_1_RED_PS_KOMODO_Operation_Guide/Content/4_Menus/Monitor/False_Color_Exposure_Mode.htm))

Finally, a finite 3D LUT interpolates between grid points. A hard threshold will blend around its boundary, and a 33-point cube samples each axis only every 1/32. It is suitable for a visible warning zone, but not for metrology at one exact integer code unless the monitoring system offers a shader, DCTL, or other non-interpolated processing path.

## Evidence from the profiles currently supported here

### ARRI LogC3

ARRI provides the most complete basis for a defensible implementation. Its official specification says false-color bounds are derived from normalized sensor-linear values and then applied to achromatic LogC signal. It publishes separate precomputed LogC3 bounds by EI and by full/legal range. For example, EI 800 uses full-range 10-bit red from code 951 through 1023 and yellow from 926 through 950; these are “1/3 stop below clipping” and “2/3 stops below clipping,” respectively. Shadow zones are explicitly “edge of shadow detail” and “noise floor,” not absolute black clipping. The same document says the tables are EI-dependent and describes using SDI metadata to select the correct table. ([ARRI LogC False Color specification](https://www.arri.com/resource/blob/390448/2d469ae1e98110562fe347cea50a284b/arri-logc-false-color-specification-data.pdf))

This can be implemented faithfully for supported EI values if the LUT input really is unmodified LogC3 in the selected range. It should be labeled “ARRI false-color sensor limit zones” rather than a generic LogC3 clipping detector.

### Panasonic V-Log

Panasonic publishes camera-specific V-Log clip values: VariCam 35 firmware 1.15+ clips at 10-bit code 911 across the listed ISO range, while VariCam HS clips at code 896. The same V-Log curve therefore does not imply one physical clipping code for all cameras. Panasonic defines V-Log black (0% reflection) at code 128, but that is an encoding/reference-black value, not proof that all darker recoverable sensor information has vanished. ([Panasonic V-Log/V-Gamut reference manual](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf))

This is feasible for named VariCam models/firmware, but not as one universal “Panasonic V-Log” threshold. Other Panasonic cameras need their own first-party clip specifications or a measured calibration mode.

### Canon Log 3

Canon documents that, for the EOS C300 Mark II/C700 system discussed, Canon Log 3 reaches the sensor saturation limit at about +6.3 stops above 18% gray and bottoms out around −7 stops. Canon also explains that Canon Log 3 deliberately omits the sensor's lowest two stops and that the deep lower region is a noise-management choice; this is different from a clean physical black-clipping boundary. Canon Log 2 illustrates why curve maximum and sensor saturation are not synonyms: its curve extends two stops beyond sensor saturation as a “sensitizing margin.” ([Canon HDR Deep Dive, Part 2](https://downloads.canon.com/nw/learn/white-papers/cinema-eos/White_Paper_Deep-Dive-HDR-Part2.pdf))

Canon Log 3 can therefore support a model/configuration-specific high-limit warning. The cited document does not justify one universal low/high code pair for every Canon camera offering Canon Log 3.

### Sony S-Log3

Sony specifies the S-Log3 encoding formula, states that it has no shoulder, and says the same conversion formula covers the full EI range. It also documents S-Log3 as full-range in files and SDI. Those facts define encoding, not a universal sensor saturation point across all Sony cameras. However, individual camera manuals can provide useful monitoring zones: the VENICE manual marks 93.3% and above as white clipping, 91.3–93.3% as just below white clipping, 2.6–5.5% as just above black clipping, and −2.4–2.6% as black clipping. ([Sony S-Log3 technical summary](https://download.pro.sony/FNGP/protein/1237494271390/1237494271406.pdf), [Sony VENICE operation manual](https://pro.sony/s3/2018/06/27130706/VENICE_Operations_Manual_v2.pdf))

Those VENICE values can back a VENICE-specific preset. They should not silently be assigned to every S-Log3 camera.

### RED Log3G10

RED describes REDWideGamutRGB/Log3G10 as an encoding designed to encompass camera colors and avoid encoding clipping, while its camera exposure tool separately judges the Log3G10 image after ISO and white balance and before any LUT. RED's histogram/exposure indicators report over- and underexposed sensor pixels, which means the camera has upstream knowledge that an external static LUT does not. ([RED IPP2 image pipeline](https://docs.red.com/955-0160/WEAPONMONSTRO8KVVOperationGuide/en-us/Content/5_Advanced_Menus/Image/ImagePipline.htm), [RED False Color Exposure Mode](https://docs.red.com/955-0190_v1.3/955-0190_v1.3_REV-1.1_1_RED_PS_KOMODO_Operation_Guide/Content/4_Menus/Monitor/False_Color_Exposure_Mode.htm), [RED Histogram](https://docs.red.com/955-0199/955-0199_V1.0_Rev_A%20RED_PS_V-RAPTOR_Operation_Guide/Content/3_Components/LCD/Histogram_Page.htm))

Without a RED-published mapping from each supported camera/mode/EI to downstream Log3G10 clipping zones, the LUT should retain “encoded-signal warning” terminology. The in-camera RED exposure tool is the authoritative choice for sensor status.

## Recommended product semantics

Keep the current generic warnings, but call them exactly what they are: **encoded-signal limits**. Add a separate, opt-in **camera-calibrated sensor-limit zones** mode only when all of these are known:

1. Camera model and sensor/readout/recording mode.
2. Log encoding and gamut at the LUT input.
3. EI/ISO and any mode that changes highlight latitude or noise behavior.
4. Full versus legal input range, bit depth, and whether the feed was rescaled.
5. Manufacturer-published bounds or a controlled calibration for that exact configuration.

For the display itself:

- Use a **near highlight limit** band, not only “already clipped.” Warning before saturation is operationally useful; once clipped, closing the iris cannot restore the current take.
- At the top, say **sensor saturation zone** only for a validated profile. Preserve per-channel indication if the goal is to catch color-channel loss; use an achromatic/luminance rule if matching a manufacturer's false-color method. ARRI's published algorithm is achromatic, not `max(R,G,B)`.
- At the bottom, use **noise floor / shadow detail at risk**. “Black clipping” should be reserved for a documented digital pedestal/processing clip. Low exposure usually loses usable information progressively as SNR falls rather than at one universal value.
- Show the selected camera, EI, and input range beside the warning. If any are unknown, fall back visibly to **encoded-signal warning—sensor clipping not guaranteed**.

## Practical conclusion

The project can provide genuinely useful “data-loss” monitoring, but not from a single threshold attached to each color-space/log-curve name. The smallest defensible first implementation is ARRI LogC3 using ARRI's published EI/range tables, followed by model-specific Panasonic VariCam and Sony VENICE presets. Canon needs camera-specific code-value validation, and RED should defer to the camera's own exposure indicators until RED publishes equivalent downstream thresholds.

Even in calibrated mode, the wording should be “matches the manufacturer's clipping/noise zones for this configured feed,” not “proves raw sensor clipping.” The camera's internal raw-domain indicators remain more authoritative because they can see sensor data and metadata before the processed RGB signal reaches the LUT.
