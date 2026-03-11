import { SignInButton } from "@clerk/clerk-react";
import { Play, Sparkles, Users, Zap, FileText, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-full bg-background">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm mb-6 gap-2">
          <Sparkles className="w-4 h-4" />
          AI-Powered Storyboard Generator
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
          Create Production-Ready
          <br />
          <span className="text-foreground">Video Storyboards</span> in Minutes
        </h1>

        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Turn briefs into production-ready storyboards in minutes.
          Perfect for instructional designers, video creators, and content teams.
        </p>

        <SignInButton mode="modal">
          <Button size="lg" className="text-base px-8 h-12">
            <Play className="w-5 h-5 mr-2" />
            Get Started with Google
          </Button>
        </SignInButton>

        <p className="text-sm text-muted-foreground mt-4">
          Free to try. No credit card required.
        </p>
      </div>

      {/* Features Section */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="font-semibold mb-2 text-foreground">5-Stage Workflow</h3>
            <p className="text-sm text-muted-foreground">
              From brief to final draft with human review at every step
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="font-semibold mb-2 text-foreground">Human-in-the-Loop</h3>
            <p className="text-sm text-muted-foreground">
              Edit AI suggestions or provide feedback to regenerate
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="font-semibold mb-2 text-foreground">Smart Image Search</h3>
            <p className="text-sm text-muted-foreground">
              Auto-fetch relevant visuals based on your content
            </p>
          </div>
        </div>
      </div>

      {/* How It Works - Human-AI Collaboration */}
      <div className="max-w-5xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-semibold text-center mb-3 text-foreground">
          The Human-AI Collaboration System
        </h2>
        <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
          Every deliverable follows a similar structure — what changes is the codified human expertise, not the collaboration touch points.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mb-10 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#F5F0EA] border border-[#E8E0D4]" />
            <span className="text-muted-foreground">HUMAN JUDGMENT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#EFF5F0] border border-[#5E8C61]" />
            <span className="text-muted-foreground">AI EXECUTION</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#FBF6ED] border border-[#C4963C]" />
            <span className="text-muted-foreground">HUMAN GATING</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#F5F0EA] border border-[#E8E0D4]" />
            <span className="text-muted-foreground">CODIFIED EXPERTISE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#FBF0ED] border border-[#C4644A]" />
            <span className="text-muted-foreground">CAPTURE DRIFT</span>
          </div>
        </div>

        {/* Workflow Diagram */}
        <div className="relative max-w-3xl mx-auto">
          {/* Step 1: Human Strategize */}
          <div className="flex items-start gap-6 mb-2">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#F5F0EA] border border-[#E8E0D4] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#7C6A56] mb-1">Human Strategize</h4>
                <p className="text-xs text-[#7C6A56]">Define objectives, audience & quality criteria</p>
              </div>
            </div>
          </div>

          {/* Connector */}
          <div className="w-px h-6 bg-gray-300 ml-[110px]" />

          {/* Step 2: AI Outline */}
          <div className="flex items-center gap-6 mb-2">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#EFF5F0] border border-[#5E8C61] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#5E8C61] mb-1">AI Scales the Writing</h4>
                <p className="text-xs text-[#5E8C61]">Outline</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400">←</span>
              <div className="flex items-center gap-2 bg-[#F5F0EA] border border-[#E8E0D4] rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-[#9C8E7C]" />
                <div className="text-left">
                  <p className="text-xs font-medium text-[#9C8E7C]">Codified Expertise</p>
                  <p className="text-xs text-[#9C8E7C]">in Writing Outline</p>
                  <p className="text-[10px] text-[#9C8E7C]">Structure, pacing, depth</p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[#C4644A] text-xs">
              <span className="border-t border-dashed border-[#C4644A] w-8" />
              <span>THE SYSTEM GETS SMARTER OVER TIME</span>
            </div>
          </div>

          {/* Connector */}
          <div className="w-px h-6 bg-gray-300 ml-[110px]" />

          {/* Step 3: Human Gate */}
          <div className="flex items-center gap-6 mb-2">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#FBF6ED] border border-[#C4963C] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#C4963C] mb-1">Human Gate</h4>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#FBF6ED]/50 border border-[#C4963C] rounded-lg px-3 py-2">
              <Check className="w-4 h-4 text-[#C4963C]" />
              <p className="text-xs text-[#C4963C]">Review AI output against quality criteria</p>
            </div>
            <div className="flex items-center gap-2 bg-[#FBF0ED] border border-[#C4644A] rounded-lg px-3 py-2">
              <RefreshCw className="w-4 h-4 text-[#C4644A]" />
              <div className="text-left">
                <p className="text-xs text-[#C4644A]">Capture what drifted → write</p>
                <p className="text-xs text-[#C4644A]">corrections back into AI guidance</p>
              </div>
            </div>
          </div>

          {/* Connector */}
          <div className="w-px h-6 bg-gray-300 ml-[110px]" />

          {/* Step 4: AI Content */}
          <div className="flex items-center gap-6 mb-2">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#EFF5F0] border border-[#5E8C61] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#5E8C61] mb-1">AI Scales the Writing</h4>
                <p className="text-xs text-[#5E8C61]">Content</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400">←</span>
              <div className="flex items-center gap-2 bg-[#F5F0EA] border border-[#E8E0D4] rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-[#9C8E7C]" />
                <div className="text-left">
                  <p className="text-xs font-medium text-[#9C8E7C]">Codified Expertise</p>
                  <p className="text-xs text-[#9C8E7C]">in Writing Content</p>
                  <p className="text-[10px] text-[#9C8E7C]">Tone, accuracy, examples</p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[#C4644A] text-xs">
              <span className="border-t border-dashed border-[#C4644A] w-8" />
              <span>THE SYSTEM GETS SMARTER OVER TIME</span>
            </div>
          </div>

          {/* Connector */}
          <div className="w-px h-6 bg-gray-300 ml-[110px]" />

          {/* Step 5: Human Gate */}
          <div className="flex items-center gap-6 mb-2">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#FBF6ED] border border-[#C4963C] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#C4963C] mb-1">Human Gate</h4>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#FBF6ED]/50 border border-[#C4963C] rounded-lg px-3 py-2">
              <Check className="w-4 h-4 text-[#C4963C]" />
              <p className="text-xs text-[#C4963C]">Review AI output against quality criteria</p>
            </div>
            <div className="flex items-center gap-2 bg-[#FBF0ED] border border-[#C4644A] rounded-lg px-3 py-2">
              <RefreshCw className="w-4 h-4 text-[#C4644A]" />
              <div className="text-left">
                <p className="text-xs text-[#C4644A]">Capture what drifted → write</p>
                <p className="text-xs text-[#C4644A]">corrections back into AI guidance</p>
              </div>
            </div>
          </div>

          {/* Connector */}
          <div className="w-px h-6 bg-gray-300 ml-[110px]" />

          {/* Step 6: Final Version */}
          <div className="flex items-start gap-6">
            <div className="flex-1 max-w-[220px]">
              <div className="bg-[#F5F0EA] border border-[#E8E0D4] rounded-lg p-4 text-center">
                <h4 className="font-semibold text-[#7C6A56] mb-1">Final Version</h4>
                <p className="text-xs text-[#7C6A56]">Ready to publish</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Note */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-4 py-2">
            <FileText className="w-4 h-4 text-[#5E8C61]" />
            <span className="text-sm font-medium text-[#5E8C61]">These Guidance Docs Are a Team Asset</span>
          </div>
        </div>
      </div>
    </div>
  );
}
