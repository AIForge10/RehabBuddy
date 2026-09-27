"""A session's peak reads in whole degrees, half up like the web app, whichever client saved it."""
from decimal import Decimal

import pytest

from api.data.queries import _deg


@pytest.mark.parametrize("saved, shown", [
    (Decimal("86.5"), 87),  # Python's round() would say 86; the web app's Math.round says 87
    (Decimal("86.49"), 86),
    (Decimal("90"), 90),
    (0.4, 0),
    (None, None),
])
def test_peaks_are_whole_degrees(saved, shown):
    assert _deg(saved) == shown
