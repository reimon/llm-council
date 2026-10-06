"""3-stage LLM Council orchestration."""

import asyncio
from typing import List, Dict, Any, Tuple
from .config import LLM_PROVIDER, TITLE_MODEL
from .council_config import active_members, load_council, role_prompt
from .providers import query_member
from .skills import skills_prompt


import time

async def query_members_parallel(
    members: List[Dict[str, Any]],
    build_messages,
    on_event=None,
    stage: int = 1,
) -> List[Tuple[Dict[str, Any], Any]]:
    """Query each seat in parallel; build_messages(member) lets each seat get its own prompt."""
    async def _query_one(member):
        if on_event:
            await on_event({
                "type": "model_start",
                "stage": stage,
                "model": member["name"],
                "role": member.get("role", "generalist"),
                "provider": member.get("provider", ""),
            })
        t0 = time.time()
        resp = await query_member(member, build_messages(member))
        elapsed = round(time.time() - t0, 1)
        if on_event:
            await on_event({
                "type": "model_complete",
                "stage": stage,
                "model": member["name"],
                "role": member.get("role", "generalist"),
                "provider": member.get("provider", ""),
                "duration": elapsed,
                "success": resp is not None,
            })
        return (member, resp)

    responses = await asyncio.gather(*[_query_one(m) for m in members])
    return responses


async def stage1_collect_responses(user_query: str, on_event=None) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.

    Args:
        user_query: The user's question
        on_event: Optional async callback for progress events

    Returns:
        List of dicts with 'model' and 'response' keys
    """
    def build(member):
        preamble = "\n\n".join(
            x for x in (role_prompt(member.get("role")), skills_prompt(member.get("skills", []))) if x
        )
        content = f"{preamble}\n\n{user_query}" if preamble else user_query
        return [{"role": "user", "content": content}]

    # Query all seats in parallel, each with its role
    responses = await query_members_parallel(active_members(), build, on_event=on_event, stage=1)

    # Format results
    stage1_results = []
    for member, response in responses:
        if response is not None:  # Only include successful responses
            stage1_results.append({
                "model": member["name"],
                "role": member.get("role", "generalist"),
                "response": response.get('content', '')
            })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    on_event=None
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.

    Args:
        user_query: The original user query
        stage1_results: Results from Stage 1
        on_event: Optional async callback for progress events

    Returns:
        Tuple of (rankings list, label_to_model mapping)
    """
    # Create anonymized labels for responses (Response A, Response B, etc.)
    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Create mapping from label to model name
    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    # Build the ranking prompt
    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    # Get rankings from all council seats in parallel (roles do not apply when judging)
    responses = await query_members_parallel(active_members(), lambda m: messages, on_event=on_event, stage=2)

    # Format results
    stage2_results = []
    for member, response in responses:
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            stage2_results.append({
                "model": member["name"],
                "ranking": full_text,
                "parsed_ranking": parsed
            })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    on_event=None
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response.

    Args:
        user_query: The original user query
        stage1_results: Individual model responses from Stage 1
        stage2_results: Rankings from Stage 2
        on_event: Optional async callback for progress events

    Returns:
        Dict with 'model' and 'response' keys
    """
    # Build comprehensive context for chairman
    stage1_text = "\n\n".join([
        f"Model: {result['model']} (council role: {result.get('role', 'generalist')})\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['ranking']}"
        for result in stage2_results
    ])

    chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: {user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    messages = [{"role": "user", "content": chairman_prompt}]

    # Query the chairman
    chairman = load_council()["chairman"]
    if on_event:
        await on_event({
            "type": "model_start",
            "stage": 3,
            "model": chairman["name"],
            "role": "chairman",
            "provider": chairman.get("provider", ""),
        })

    # Skills attached to the chair shape the synthesis
    chair_skills = skills_prompt(chairman.get("skills", []))
    if chair_skills:
        messages = [{"role": "user", "content": f"{chair_skills}\n\n{chairman_prompt}"}]

    t0 = time.time()
    response = await query_member(chairman, messages)
    elapsed = round(time.time() - t0, 1)

    if on_event:
        await on_event({
            "type": "model_complete",
            "stage": 3,
            "model": chairman["name"],
            "role": "chairman",
            "provider": chairman.get("provider", ""),
            "duration": elapsed,
            "success": response is not None,
        })

    if response is None:
        # Fallback if chairman fails
        return {
            "model": chairman["name"],
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": chairman["name"],
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.

    Args:
        ranking_text: The full text response from the model

    Returns:
        List of response labels in ranked order
    """
    import re

    # Look for "FINAL RANKING:" section
    if "FINAL RANKING:" in ranking_text:
        # Extract everything after "FINAL RANKING:"
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            # Try to extract numbered list format (e.g., "1. Response A")
            # This pattern looks for: number, period, optional space, "Response X"
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                # Extract just the "Response X" part
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]

            # Fallback: Extract all "Response X" patterns in order
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    # Fallback: try to find any "Response X" patterns in order
    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings across all models.

    Args:
        stage2_results: Rankings from each model
        label_to_model: Mapping from anonymous labels to model names

    Returns:
        List of dicts with model name and average rank, sorted best to worst
    """
    from collections import defaultdict

    # Track positions for each model
    model_positions = defaultdict(list)

    for ranking in stage2_results:
        ranking_text = ranking['ranking']

        # Parse the ranking from the structured format
        parsed_ranking = parse_ranking_from_text(ranking_text)

        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_name = label_to_model[label]
                model_positions[model_name].append(position)

    # Calculate average position for each model
    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions)
            })

    # Sort by average rank (lower is better)
    aggregate.sort(key=lambda x: x['average_rank'])

    return aggregate


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message

    Returns:
        A short title (3-5 words)
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    # Use gemini-2.5-flash for title generation (fast and cheap)
    title_provider = "codex" if LLM_PROVIDER == "codex" else "openrouter"
    response = await query_member({"provider": title_provider, "model": TITLE_MODEL}, messages, timeout=120.0)

    if response is None:
        # Fallback to a generic title
        return "Nova conversa"

    title = response.get('content', 'Nova conversa').strip()

    # Clean up the title - remove quotes, limit length
    title = title.strip('"\'')

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


async def run_full_council(user_query: str) -> Tuple[List, List, Dict, Dict]:
    """
    Run the complete 3-stage council process.

    Args:
        user_query: The user's question

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata)
    """
    # Stage 1: Collect individual responses
    stage1_results = await stage1_collect_responses(user_query)

    # If no models responded successfully, return error
    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, {}

    # Stage 2: Collect rankings
    stage2_results, label_to_model = await stage2_collect_rankings(user_query, stage1_results)

    # Calculate aggregate rankings
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Stage 3: Synthesize final answer
    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results
    )

    # Prepare metadata
    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings
    }

    return stage1_results, stage2_results, stage3_result, metadata
