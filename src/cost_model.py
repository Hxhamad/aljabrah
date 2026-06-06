"""Simple deterministic cost adjustments."""

from __future__ import annotations


def edge_after_cost(overnight_edge: float, cost_bps: float) -> float:
    """Subtract one round-trip basis-point cost from each daily edge observation."""

    return float(overnight_edge) - float(cost_bps) / 10_000.0


def cost_metrics(overnight_edge: float, cost_bps_list: list[float]) -> dict[str, float]:
    """Return stable output names for all configured cost assumptions."""

    return {
        f"edge_after_cost_{int(bps) if float(bps).is_integer() else bps}bps": edge_after_cost(
            overnight_edge, bps
        )
        for bps in cost_bps_list
    }
