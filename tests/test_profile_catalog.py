import pytest

from lut_builder.data import PROFILE_CATALOG, ProfileCatalog


def test_catalog_returns_source_and_target_facts():
    source = PROFILE_CATALOG.source("Sony S-Log3")
    target = PROFILE_CATALOG.target("Rec.709")

    assert source.name == "Sony S-Log3"
    assert source.gamut == "S-Gamut3.Cine"
    assert source.log == "S-Log3"
    assert source.log_floor == pytest.approx(0.0929)
    assert source.log_ceiling == pytest.approx(0.94)
    assert target.name == "Rec.709"
    assert target.gamut == "ITU-R BT.709"
    assert target.transfer == "ITU-R BT.709"
    assert target.encoding == "oetf"


def test_catalog_validation_reports_invalid_profile_entries():
    catalog = ProfileCatalog(
        sources={
            "Broken camera": {
                "gamut": [],
                "log": {},
                "log_floor": 1.1,
                "log_ceiling": -0.1,
            }
        },
        targets={
            "Broken encoding": {
                "gamut": "ITU-R BT.709",
                "gamma": "ITU-R BT.709",
                "encoding": [],
            },
            "Broken transfer": {
                "gamut": "ITU-R BT.709",
                "gamma": [],
                "encoding": "oetf",
            },
        },
    )

    with pytest.raises(ValueError) as exc_info:
        catalog.validate()

    message = str(exc_info.value)
    for field in ("gamut", "log", "log_floor", "log_ceiling", "encoding", "transfer"):
        assert field in message
