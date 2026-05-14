from PIL import Image, ImageDraw, ImageFont
import os

# Config
SIZE = (1024, 1024)
BG_COLOR = "#FFF9F4" # Cream
CIRCLE_COLOR = "#FFFFFF" # White
CIRCLE_RADIUS = 300
EMOJI = "🔔"
# Apple Color Emoji largest native size is usually 160
FONT_SIZE = 160 
TARGET_EMOJI_SIZE = 400
FONT_PATH = "/System/Library/Fonts/Apple Color Emoji.ttc"

def create_icon():
    print("Generating icon...")
    # Create Main Image
    img = Image.new('RGB', SIZE, BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Draw Circle
    center = (SIZE[0] // 2, SIZE[1] // 2)
    draw.ellipse(
        [
            (center[0] - CIRCLE_RADIUS, center[1] - CIRCLE_RADIUS),
            (center[0] + CIRCLE_RADIUS, center[1] + CIRCLE_RADIUS)
        ],
        fill=CIRCLE_COLOR
    )

    # Draw Emoji
    try:
        font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
        
        # Create a temp image for the emoji
        # Size needs to be enough for 160px font
        emoji_img_size = (200, 200)
        emoji_img = Image.new('RGBA', emoji_img_size, (0,0,0,0))
        emoji_draw = ImageDraw.Draw(emoji_img)
        
        # Draw text
        # anchor="mm"
        emoji_draw.text((100, 100), EMOJI, font=font, anchor="mm", embedded_color=True)
        
        # Crop to content (optional but good)
        bbox = emoji_img.getbbox()
        if bbox:
            emoji_img = emoji_img.crop(bbox)
            
        # Resize to target size (400px)
        # Lanczos for quality
        emoji_img = emoji_img.resize((TARGET_EMOJI_SIZE, TARGET_EMOJI_SIZE), Image.Resampling.LANCZOS)
        
        # Paste into main image
        # Center position
        paste_pos = (
            center[0] - emoji_img.width // 2,
            center[1] - emoji_img.height // 2
        )
        
        img.paste(emoji_img, paste_pos, emoji_img)
        print("Drawn emoji successfully.")
            
    except Exception as e:
        print(f"Error drawing emoji: {e}")
        # Fallback: Draw 'N'
        try:
            fallback_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 400)
            draw.text(center, "N", font=fallback_font, anchor="mm", fill="#6B7BE8")
        except:
            pass

    # Ensure assets dir exists
    if not os.path.exists("assets"):
        os.makedirs("assets")
        
    # Save
    img.save("assets/icon.png")
    img.save("assets/adaptive-icon.png")
    
    # Also save to iOS path
    ios_path = "ios/NudgeMeGentleReminder/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
    if os.path.exists(os.path.dirname(ios_path)):
        img.save(ios_path)
        print(f"Saved to {ios_path}")

    print("Icons generated successfully.")

if __name__ == "__main__":
    create_icon()
