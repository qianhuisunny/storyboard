from typing import Optional, Union, List
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class VideoType(int, Enum):
    """Video type enumeration"""
    PRODUCT_RELEASE = 1
    HOW_TO_DEMO = 2
    KNOWLEDGE_SHARING = 3

class Type1VideoRequirements(BaseModel):
    """Requirements specific to Product Release videos (Type 1)"""
    key_features: str = Field(..., description="Key features of this release")
    typical_use_cases: str = Field(..., description="Typical use cases of the product")
    core_interaction_steps: str = Field(..., description="Core interaction steps")

class Type2VideoRequirements(BaseModel):
    """Requirements specific to Product Demo videos (Type 2)"""
    core_interaction_steps: str = Field(..., description="Core interaction steps")
    where_people_make_mistakes: Optional[str] = Field(None, description="Where people make mistakes (optional)")

class Type3VideoRequirements(BaseModel):
    """Requirements specific to Knowledge Sharing/Success Stories videos (Type 3)"""
    success_story: str = Field(..., description="Success story or knowledge to share")
    key_learnings: str = Field(..., description="Key learnings or insights")
    target_outcomes: str = Field(..., description="Target outcomes for viewers")

class ProjectRequirements(BaseModel):
    """Main project requirements model"""
    audience: str = Field(..., description="Target audience for the video")
    cta: Optional[str] = Field(None, description="Call to action (optional)")
    duration: int = Field(..., gt=0, description="Video duration in seconds")
    type: VideoType = Field(..., description="Video type: 1=Product Release, 2=Product Demo, 3=Knowledge Sharing")
    cta: Optional[str] = Field(None, description="Call to action (optional)")
    has_face: bool = Field(..., description="Whether to show narrator face")
    main_problem: str = Field(..., description="Main problem your user wanted to solve")
 
    # Type-specific requirements (only one should be populated based on type)
    type1_requirements: Optional[Type1VideoRequirements] = Field(None, description="Type 1 (Product Release) specific requirements")
    type2_requirements: Optional[Type2VideoRequirements] = Field(None, description="Type 2 (Product Demo) specific requirements")
    type3_requirements: Optional[Type3VideoRequirements] = Field(None, description="Type 3 (Knowledge Sharing) specific requirements")

    def model_post_init(self, __context=None) -> None:
        """Validate that the correct type-specific requirements are provided"""
        if self.type == VideoType.PRODUCT_RELEASE and self.type1_requirements is None:
            raise ValueError("Type 1 requirements must be provided for Product Release videos")
        elif self.type == VideoType.HOW_TO_DEMO and self.type2_requirements is None:
            raise ValueError("Type 2 requirements must be provided for Product Demo videos")
        elif self.type == VideoType.KNOWLEDGE_SHARING and self.type3_requirements is None:
            raise ValueError("Type 3 requirements must be provided for Knowledge Sharing videos")

    def get_type_specific_requirements(self) -> Union[Type1VideoRequirements, Type2VideoRequirements, Type3VideoRequirements]:
        """Get the type-specific requirements based on video type"""
        if self.type == VideoType.PRODUCT_RELEASE:
            return self.type1_requirements
        elif self.type == VideoType.HOW_TO_DEMO:
            return self.type2_requirements
        elif self.type == VideoType.KNOWLEDGE_SHARING:
            return self.type3_requirements
        else:
            raise ValueError(f"Unknown video type: {self.type}")

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return self.model_dump(exclude_none=True)

    @classmethod
    def from_dict(cls, data: dict) -> 'ProjectRequirements':
        """Create instance from dictionary"""
        return cls.model_validate(data)


# Extended project model that includes the requirements
class Project(BaseModel):
    """Complete project model including requirements"""
    id: str = Field(..., description="Unique project identifier")
    name: str = Field(..., description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    requirements: Optional[ProjectRequirements] = Field(None, description="Project requirements")
    stories: List[str] = Field(default_factory=list, description="List of story IDs")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")

    @classmethod
    def from_dict(cls, data: dict) -> 'Project':
        """Create instance from dictionary"""
        return cls.model_validate(data)