import sys
import time
import json
import random

print("Starting add_user.py script...")
print(f"Received {len(sys.argv) - 1} arguments.")

if len(sys.argv) > 1:
    print("Arguments:")
    # Start from the second argument, as the first is the script name
    for i, arg in enumerate(sys.argv[1:]):
        print(f"  Arg {i+1}: {arg}")

# Simulate variable work duration
sleep_duration = random.uniform(3, 30)
print(f"\nSimulating a process that will take {sleep_duration:.2f} seconds...")
time.sleep(sleep_duration)

# Simulate a 25% chance of failure
if random.random() < 0.25:
    print("\n--- SIMULATING RANDOM FAILURE ---", file=sys.stderr)
    sys.stderr.flush()
    print("An unexpected error occurred during the API call.", file=sys.stderr)
    sys.exit(1)

# Success path
output = {
    "status": "success",
    "message": "User processed successfully.",
    "processed_args": sys.argv[1:]
}
print("\nScript finished successfully.")
# Use a clear delimiter for easy parsing on the frontend if needed
print("---JSON_OUTPUT_START---")
print(json.dumps(output, indent=2))
print("---JSON_OUTPUT_END---")

sys.stdout.flush()
