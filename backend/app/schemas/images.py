from pydantic import BaseModel
from typing import List, Optional


class ImageSummary(BaseModel):
    id: str
    full_id: str
    name: str
    repository: str
    tag: str
    tags: List[str]
    size: int
    created: str
    dangling: bool = False
    in_use: bool = False
    container_count: int = 0


class ImageActionResponse(BaseModel):
    success: bool
    image_id: str
    message: str
    reclaimed_bytes: Optional[int] = 0
