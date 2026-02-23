import enum
from typing import Annotated
from livekit.agents import function_tool
import logging

logger = logging.getLogger("temperature-control")
logger.setLevel(logging.INFO)


class Zone(enum.Enum):
    LIVING_ROOM = "living_room"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    OFFICE = "office"


class AssistantFnc:
    def __init__(self) -> None:
        self._temperature = {
            Zone.LIVING_ROOM: 22,
            Zone.BEDROOM: 20,
            Zone.KITCHEN: 24,
            Zone.BATHROOM: 23,
            Zone.OFFICE: 21,
        }

    @function_tool(description="get the temperature in a specific room")
    def get_temperature(
        self, zone: Annotated[Zone, "The specific zone"]
    ):
        logger.info("get temp - zone %s", zone)
        temp = self._temperature[Zone(zone)]
        return f"The temperature in the {zone} is {temp}C"

    @function_tool(description="set the temperature in a specific room")
    def set_temperature(
        self,
        zone: Annotated[Zone, "The specific zone"],
        temp: Annotated[int, "The temperature to set"],
    ):
        logger.info("set temp - zone %s, temp: %s", zone, temp)
        self._temperature[Zone(zone)] = temp
        return f"The temperature in the {zone} is now {temp}C"
